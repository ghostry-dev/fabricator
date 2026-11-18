import type { AdaptationsOf } from "../../Adapter/Types.ts";
import { effectiveDiscrete } from "../../Bound.ts";
import { discreteSampler } from "../../Distribution/index.ts";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types.ts";
import { toStreamFromTrace } from "../../Random/index.ts";
import type { Stream, Trace } from "../../Random/Types.ts";
import { Children, Kind, Meta, type Adaptation } from "../../Types.ts";
import { assertCapacity, toDistinct } from "../../Unique/Distinct.ts";
import { withinCollection } from "../../Unique/Strategy.ts";
import { Schema } from "./Schema.ts";
import type {
  Definition,
  Fabricated,
  Meta as ThisMeta,
  Unique,
  Whereby,
} from "./Types.ts";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema extends { [Meta]: ThisMeta }>
    ? Fabricated<$Schema[typeof Meta]["definition"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated<$Schema[typeof Meta]["definition"]>> & {
  [Kind]: "array";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: NaiveFabricator<any>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["definition"], AdaptationsOf<$Schema>>;
};

export function Fabricator<$Definition extends Definition>(
  context: FabricatorContext<Schema<$Definition>>,
  element: BaseFabricator<any>,
): Fabricator<Schema<$Definition>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "array",
      [Meta]: meta,
      trace,
      [Children]: element,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);
  const whereby = meta.whereby;
  const drawLength = discreteSampler(
    whereby.length.distribution,
    effectiveDiscrete(whereby.length.min, whereby.length.max),
    stream,
  );

  const draw = withinCollection("array", element);
  const fabricate = meta.unique
    ? distinctly(element, stream, meta.unique, whereby, drawLength)
    : (): Fabricated<$Definition> =>
        Array.from({ length: drawLength() }, draw) as Fabricated<$Definition>;

  return {
    [Kind]: "array",
    [Meta]: meta,
    trace,
    [Children]: element,
    fabricate,
    schema: rehydrated,
  };
}

/**
 * `T.unique.array`'s draw. The strategy is chosen once, here, so the capacity
 * check runs at construction; each call then opens a fresh scope, so members
 * are distinct within one array and free to repeat across arrays. An exact
 * member draws from this array's own `stream`, which the length draw shares.
 */
function distinctly(
  element: BaseFabricator<any>,
  stream: Stream,
  unique: Unique,
  whereby: Whereby,
  drawLength: () => number,
): () => any {
  const distinct = toDistinct(element, stream, {
    label: "T.unique.array",
    by: unique.by,
    redraws: whereby.redraws,
  });
  assertCapacity(
    "T.unique.array",
    distinct,
    effectiveDiscrete(whereby.length.min, whereby.length.max).max,
  );

  return () => {
    const count = drawLength();
    const scope = distinct.open();
    return Array.from({ length: count }, () => scope.draw());
  };
}
