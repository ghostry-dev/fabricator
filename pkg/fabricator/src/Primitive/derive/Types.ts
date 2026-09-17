import type { Adaptations } from "../../Adapter/Types";
import type { ProduceContext } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";
import type { Resolved, Source } from "../object/compute/Types";
import type * as tuple from "../tuple/Types";

/**
 * `from` is a tuple of schemas, one per input slot — the same shape
 * `tuple.Items` already is, so `tuple.Fabricated` can type `resolve`'s `values`
 * as a positional `[A, B]` rather than `(A | B)[]`.
 */
export type From = tuple.Items;

/**
 * Re-exported so this kind's other files (and `Primitive.derive.Source`) name
 * the same `to` contract `object.compute` uses, rather than restating it.
 */
export type { Denoted, Resolved, Source } from "../object/compute/Types";

/**
 * `from` is stored after `toSchema` (inert per-slot schemas, same as `tuple`).
 * `to` is stored exactly as given, whether a Schema or a builder, so its
 * `[Meta]` and `[Adaptation]` survive: adapters convert it as a nested schema
 * (honoring its own adaptation unless the derive is adapted), and
 * `toValueKind` follows it to the kind a result or override is checked
 * against. `resolve` is plain data from the moment `.as(resolve)` is called.
 * `to` is only used for its shape/type — the value comes entirely from
 * `resolve`, which is why `to` may not even have a buildable recipe (a bare
 * `T.string`/`T.bigint`).
 */
export type Meta<$From extends From = From, $To extends Source = Source> = {
  from: $From;
  to: $To;
  resolve: (
    values: tuple.Fabricated<$From>,
    context: ProduceContext,
  ) => Resolved<$To>;
};

export interface Core<
  $From extends From = From,
  $To extends Source = Source,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "derive";
  [Meta]: Meta<$From, $To>;
  bindings?: unknown[];
  readonly [Produces]?: Resolved<$To, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
