import type { AdaptationsOf } from "../../Adapter/Types";
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
  [Kind]: "tuple";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: ReadonlyArray<NaiveFabricator<any>>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["items"], AdaptationsOf<$Schema>>;
};

/**
 * `elements` are each slot's _already-dispatched_ Fabricator, one per
 * `[Meta].items` entry, built by `Constructor.ts`'s `make` before this call —
 * mirrors `choice.Fabricator`'s `weightings`, one per option, rather than
 * `array.Fabricator`'s single shared `element`. The `array`/`tuple`
 * distinction: each slot gets its own private stream, so `T.tuple([T.number,
 * T.number])` behaves like a two-field `object` of numbers, not a length-2
 * `array` of numbers (every element drawn sequentially off one shared stream).
 *
 * `toStreamFromTrace` is only consulted on the `.as(...)`-overridden path: an
 * ordinary tuple draws no randomness of its own — every draw belongs to a slot,
 * exactly like `object`. `trace` is still recorded so a nested tuple can be
 * replayed from its own schema.
 */
export function Fabricator<$Items extends Items>(
  context: FabricatorContext<Schema<$Items>>,
  elements: ReadonlyArray<NaiveFabricator<any>>,
): Fabricator<Schema<$Items>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "tuple",
      [Meta]: meta,
      trace,
      [Children]: elements,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const fabricate = (): Fabricated<$Items> =>
    elements.map((element) => element.fabricate()) as Fabricated<$Items>;

  return {
    [Kind]: "tuple",
    [Meta]: meta,
    trace,
    [Children]: elements,
    fabricate,
    schema: rehydrated,
  };
}
