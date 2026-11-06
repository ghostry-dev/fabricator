import type { AdaptationsOf } from "../../Adapter/Types";
import {
  assertNonemptyDiscrete,
  effectiveDiscrete,
  type Bound,
} from "../../Bound";
import { Distribution, sampler } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Stream, Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Claim, Kind, MAX_TIME, Meta, type Adaptation } from "../../Types";
import { toDateStrategy } from "../../Unique/Distinct";
import { toLifetimeScope } from "../../Unique/Strategy";
import { toEpochBounds, toEpochRange } from "./Defaults";
import { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta, Whereby } from "./Types";

export type Fabrication<_ extends Fabricator> = Fabricated;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated> & {
  [Kind]: "date";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  /** Present on a `T.unique.date` only — see `Types.ts`'s `Claim`. */
  readonly [Claim]?: (value: unknown) => void;
  schema: Schema<$Schema[typeof Meta], AdaptationsOf<$Schema>>;
};

export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, algorithm, trace, exhaustion } = context;
  const { clock } = trace;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "date",
      [Meta]: meta,
      trace,
      fabricate: () => produce({ random: stream, clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);

  /**
   * Whole milliseconds drawn straight from `stream`, not through {@link toDraw}
   * — see `Unique/Distinct.ts`'s `toDateStrategy` for why the ordinary
   * continuous draw cannot back a counted range.
   */
  if (meta.unique) {
    const scope = toLifetimeScope(
      toDateStrategy({
        label: "T.unique.date",
        range: toEpochRange(meta, clock),
        distribution: meta.whereby?.distribution,
        stream,
        redraws: meta.whereby?.redraws,
      }),
      exhaustion,
    );

    return {
      [Kind]: "date",
      [Meta]: meta,
      trace,
      fabricate: () => scope.draw() as Date,
      [Claim]: scope.claim,
      schema: rehydrated,
    };
  }

  const fabricate = toDraw(meta, clock, stream);

  return { [Kind]: "date", [Meta]: meta, trace, fabricate, schema: rehydrated };
}

/**
 * This kind's ordinary draw for each mode. A bare `past`/`future`/`date` maps
 * one unit draw straight across its span; a `whereby` goes through
 * {@link draw}'s whole-millisecond interval.
 */
function toDraw(meta: ThisMeta, clock: number, stream: Stream): () => Date {
  const whereby = meta.whereby;
  const prefix = meta.unique ? "T.unique.date" : "T.date";

  if (meta.mode === "past") {
    if (!whereby) {
      return () => new Date(clock - stream.next() * (clock + MAX_TIME));
    }
    return drawPastOrFuture(
      toEpochBounds(meta, clock),
      `${prefix}.past`,
      whereby.distribution,
      stream,
    );
  }

  if (meta.mode === "future") {
    if (!whereby) {
      return () => new Date(clock + stream.next() * (MAX_TIME - clock));
    }
    return drawPastOrFuture(
      toEpochBounds(meta, clock),
      `${prefix}.future`,
      whereby.distribution,
      stream,
    );
  }

  if (!whereby) return () => new Date((stream.next() * 2 - 1) * MAX_TIME);
  return draw(toEpochBounds(meta, clock), whereby.distribution, stream);
}

function drawPastOrFuture(
  range: { min: Bound<number>; max: Bound<number> },
  label: string,
  distribution: Whereby["distribution"],
  stream: Stream,
): () => Date {
  assertNonemptyDiscrete(label, range.min, range.max);
  return draw(range, distribution, stream);
}

/**
 * Draw a `Date` from an epoch-millisecond range. `Date` is millisecond- valued
 * (`TimeClip`), so exclusive ends resolve the same way integer bounds do — then
 * the existing continuous `Distribution` sampler runs on that inclusive ms
 * interval. Sampling the stated floats and constructing a `Date` would clip an
 * exclusive-min draw back onto the excluded instant.
 */
const draw = (
  range: { min: Bound<number>; max: Bound<number> },
  distribution: Whereby["distribution"],
  stream: Stream,
): (() => Date) => {
  const inclusive = effectiveDiscrete(range.min, range.max);
  const next = sampler(
    distribution ?? Distribution.uniform(),
    inclusive,
    stream,
  );
  return () => new Date(next());
};
