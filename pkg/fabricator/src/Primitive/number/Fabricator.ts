import type { AdaptationsOf } from "../../Adapter/Types";
import { constrainContinuous, effectiveDiscrete } from "../../Bound";
import { Distribution, sampler } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Kind, Meta, type Adaptation } from "../../Types";
import { unboundedContinuous, unboundedDiscrete } from "./defaults";
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
  schema: Schema<$Schema[typeof Meta], AdaptationsOf<$Schema>>;
};

export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, algorithm, trace } = context;
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

  if (meta.integer) {
    const { min, max } = effectiveDiscrete(range.min, range.max);
    /**
     * Draws over [min, max + 1) and floors, so each integer owns a
     * full-width bucket — avoiding the half-width endpoint bias that
     * rounding a [min, max] draw would produce. `min`/`max` here are
     * already the effective inclusive integers after exclusive ends.
     */
    const draw = sampler(distribution, { min, max: max + 1 }, stream);
    return {
      [Kind]: "number",
      [Meta]: meta,
      trace,
      fabricate: () => Math.min(max, Math.floor(draw())),
      schema: rehydrated,
    };
  }

  return {
    [Kind]: "number",
    [Meta]: meta,
    trace,
    fabricate: constrainContinuous(
      sampler(
        distribution,
        { min: range.min.value, max: range.max.value },
        stream,
      ),
      range.min,
      range.max,
    ),
    schema: rehydrated,
  };
}
