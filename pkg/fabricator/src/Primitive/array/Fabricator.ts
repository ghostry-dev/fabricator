import type { AdaptationsOf } from "../../Adapter/Types";
import { effectiveDiscrete } from "../../Bound";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Children, Kind, Meta, type Adaptation } from "../../Types";
import { inline } from "../../Utility/Core";
import { Schema } from "./Schema";
import type { Definition, Fabricated, Meta as ThisMeta } from "./Types";

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
  element: NaiveFabricator<any>,
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

  const fabricate = (): Fabricated<$Definition> => {
    const length = inline((): number => {
      /**
       * Uniform and inclusive across the effective `[min, max]` after
       * exclusive ends are resolved — the same formula `string/Fabricator.ts`
       * uses for its own length (and `record`'s for its `size`).
       */
      const { min, max } = effectiveDiscrete(
        whereby.length.min,
        whereby.length.max,
      );

      return min + Math.floor(stream.next() * (max - min + 1));
    });

    return Array.from({ length }, () =>
      element.fabricate(),
    ) as Fabricated<$Definition>;
  };

  return {
    [Kind]: "array",
    [Meta]: meta,
    trace,
    [Children]: element,
    fabricate,
    schema: rehydrated,
  };
}
