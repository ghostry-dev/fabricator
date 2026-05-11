import type { AdaptationsOf } from "../../Adapter/Types";
import {
  assertNonemptyDiscrete,
  effectiveDiscrete,
  epochBound,
  type Bound,
} from "../../Bound";
import { Distribution, sampler } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Stream, Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Kind, MAX_TIME, Meta, type Adaptation } from "../../Types";
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
  schema: Schema<$Schema[typeof Meta], AdaptationsOf<$Schema>>;
};

export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, algorithm, trace } = context;
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
  const whereby = meta.whereby;

  if (meta.mode === "past") {
    const fabricate = whereby
      ? drawPastOrFuture(
          {
            min: whereby.min
              ? epochBound(whereby.min)
              : { value: -MAX_TIME, exclusive: false },
            max: { value: clock, exclusive: false },
          },
          "T.date.past",
          whereby.distribution,
          stream,
        )
      : () => new Date(clock - stream.next() * (clock + MAX_TIME));
    return {
      [Kind]: "date",
      [Meta]: meta,
      trace,
      fabricate,
      schema: rehydrated,
    };
  }

  if (meta.mode === "future") {
    const fabricate = whereby
      ? drawPastOrFuture(
          {
            min: { value: clock, exclusive: false },
            max: whereby.max
              ? epochBound(whereby.max)
              : { value: MAX_TIME, exclusive: false },
          },
          "T.date.future",
          whereby.distribution,
          stream,
        )
      : () => new Date(clock + stream.next() * (MAX_TIME - clock));
    return {
      [Kind]: "date",
      [Meta]: meta,
      trace,
      fabricate,
      schema: rehydrated,
    };
  }

  const fabricate = whereby
    ? draw(
        { min: epochBound(whereby.min!), max: epochBound(whereby.max!) },
        whereby.distribution,
        stream,
      )
    : () => new Date((stream.next() * 2 - 1) * MAX_TIME);

  return {
    [Kind]: "date",
    [Meta]: meta,
    trace,
    fabricate,
    schema: rehydrated,
  };
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
 * Draw a `Date` from an epoch-millisecond range. `Date` is millisecond-
 * valued (`TimeClip`), so exclusive ends resolve the same way integer
 * bounds do — then the existing continuous `Distribution` sampler runs
 * on that inclusive ms interval. Sampling the stated floats and
 * constructing a `Date` would clip an exclusive-min draw back onto the
 * excluded instant.
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
