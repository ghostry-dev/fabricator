import type { AdaptationsOf } from "../../Adapter/Types";
import { weighted } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Children, Kind, Meta, type Adaptation } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, Items, Meta as ThisMeta } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema extends { [Meta]: ThisMeta }>
    ? Fabricated<$Schema[typeof Meta]["items"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated<$Schema[typeof Meta]["items"]>> & {
  [Kind]: "choice";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: ReadonlyArray<NaiveFabricator<any>>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["items"], AdaptationsOf<$Schema>>;
};

/**
 * `weightings` are each option's *already-dispatched* Fabricator, one per
 * `[Meta].items` entry, built by `Constructor.ts`'s `make` before this call —
 * mirrors `array.Fabricator`'s `element`, just one per option instead of
 * one shared across every element. The weighted pick happens on this
 * field's private stream; only the chosen option's `fabricate()` is called,
 * so an unpicked option never advances its stream (safe for the same reason
 * skipping `object.omittable`'s inner draw is — see CLAUDE.md's
 * "Randomness").
 */
export function Fabricator<$Items extends Items>(
  context: FabricatorContext<Schema<$Items>>,
  weightings: ReadonlyArray<readonly [number, NaiveFabricator<any>]>,
): Fabricator<Schema<$Items>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);
  const options = weightings.map(([, option]) => option);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "choice",
      [Meta]: meta,
      trace,
      [Children]: options,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);
  const pick = weighted(weightings, stream, "T.choice");
  const fabricate = () => pick().fabricate();

  return {
    [Kind]: "choice",
    [Meta]: meta,
    trace,
    [Children]: options,
    fabricate,
    schema: rehydrated,
  };
}
