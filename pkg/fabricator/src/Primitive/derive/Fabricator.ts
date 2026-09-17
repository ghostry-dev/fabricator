import type { AdaptationsOf } from "../../Adapter/Types";
import { FabricatorError } from "../../Error";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import { toStreamFromTrace } from "../../Random";
import type { Trace } from "../../Random/Types";
import { toValueKind, violatesKind } from "../../Schema/Core";
import { Children, Kind, Meta, type Adaptation } from "../../Types";
import type { Fabricated as FromValues } from "../tuple/Types";
import { Schema } from "./Schema";
import type { From, Meta as ThisMeta, Resolved, Source } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema extends { [Meta]: ThisMeta }>
    ? Resolved<$Schema[typeof Meta]["to"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Resolved<$Schema[typeof Meta]["to"]>> & {
  [Kind]: "derive";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: ReadonlyArray<NaiveFabricator<any>>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  /**
   * Given `from`, resolves those values instead of fabricating each slot.
   * Enumeration uses this to pin `from` slots and still run `resolve` on them
   * (see `Enumeration/Plan.ts`).
   */
  fabricate: (params?: {
    from: FromValues<$Schema[typeof Meta]["from"]>;
  }) => Resolved<$Schema[typeof Meta]["to"]>;
  schema: Schema<
    $Schema[typeof Meta]["from"],
    $Schema[typeof Meta]["to"],
    AdaptationsOf<$Schema>
  >;
};

/**
 * `from` are each input slot's _already-dispatched_ Fabricator, one per
 * `[Meta].from` entry, built by `Constructor.ts`'s `make` before this call —
 * the same shape `tuple.Fabricator`'s `elements` take. Each slot gets its own
 * private stream, so two same-kind inputs produce independent sequences rather
 * than a correlated shared one.
 *
 * `toStreamFromTrace` is always consulted: `resolve` is required (there is no
 * bare path) and is handed this node's `ProduceContext`, so any extra
 * randomness it draws still replays under a salt. Don't collapse that into a
 * conditional — `resolve` is the equivalent of every other kind's `produce`,
 * and here it is always present.
 */
export function Fabricator<$From extends From, $To extends Source>(
  context: FabricatorContext<Schema<$From, $To>>,
  from: ReadonlyArray<NaiveFabricator<any>>,
): Fabricator<Schema<$From, $To>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);
  const stream = toStreamFromTrace(algorithm, trace);
  const resolve = meta.resolve;
  const toKind = toValueKind(meta.to);

  return {
    [Kind]: "derive",
    [Meta]: meta,
    trace,
    [Children]: from,
    fabricate: (params?: { from: FromValues<$From> }) => {
      const values =
        params?.from
        ?? (from.map((slot) => slot.fabricate()) as FromValues<$From>);
      const result = resolve(values, { random: stream, clock: trace.clock });

      if (violatesKind(toKind, result)) {
        throw new FabricatorError.DeriveResultMismatchError(toKind, result);
      }

      return result;
    },
    schema: rehydrated,
  };
}
