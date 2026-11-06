import type { AdaptationsOf } from "../../Adapter/Types";
import { constrainContinuous, effectiveDiscrete } from "../../Bound";
import { Distribution, discreteSampler, sampler } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import { toStreamFromTrace } from "../../Random";
import type { Trace } from "../../Random/Types";
import { Claim, Kind, Meta, type Adaptation } from "../../Types";
import { toNumberStrategy } from "../../Unique/Distinct";
import { toLifetimeScope } from "../../Unique/Strategy";
import { unboundedContinuous, unboundedDiscrete } from "./Defaults";
import { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta } from "./Types";

export type Fabrication<_ extends Fabricator> = Fabricated;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated> & {
  [Kind]: "number";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  /** Present on a `T.unique.number` only — see `Types.ts`'s `Claim`. */
  readonly [Claim]?: (value: unknown) => void;
  schema: Schema<$Schema[typeof Meta], AdaptationsOf<$Schema>>;
};

export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, algorithm, trace, exhaustion } = context;
  const meta = schema[Meta];
  const rehydrated = Schema({ ...schema, [Meta]: meta });

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "number",
      [Meta]: meta,
      trace,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  if (meta.sequence) {
    let next = 1;
    return {
      [Kind]: "number",
      [Meta]: meta,
      trace,
      fabricate: () => next++,
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);
  const defaults = meta.integer ? unboundedDiscrete : unboundedContinuous;
  const range = {
    min: meta.whereby?.min ?? defaults.min,
    max: meta.whereby?.max ?? defaults.max,
    distribution: meta.whereby?.distribution,
  };
  const distribution = range.distribution ?? Distribution.uniform();

  const draw = meta.integer
    ? discreteSampler(
        distribution,
        effectiveDiscrete(range.min, range.max),
        stream,
      )
    : constrainContinuous(
        sampler(
          distribution,
          { min: range.min.value, max: range.max.value },
          stream,
        ),
        range.min,
        range.max,
      );

  /**
   * `draw` is built either way but only called on the tracked path — an exact
   * permutation draws its positions from `stream` itself, and a sampler that is
   * never called consumes nothing.
   */
  if (meta.unique) {
    const scope = toLifetimeScope(
      toNumberStrategy({ label: "T.unique.number", meta, stream, draw }),
      exhaustion,
    );

    return {
      [Kind]: "number",
      [Meta]: meta,
      trace,
      fabricate: () => scope.draw() as number,
      [Claim]: scope.claim,
      schema: rehydrated,
    };
  }

  return {
    [Kind]: "number",
    [Meta]: meta,
    trace,
    fabricate: draw,
    schema: rehydrated,
  };
}
