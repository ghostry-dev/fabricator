import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import {
  schemaSatisfies as satisfies,
  type SatisfiesThis,
} from "../../Schema/Satisfies";
import { Kind, Meta } from "../../Types";
import { toAdmits } from "./Admits";
import type {
  Core,
  Fabricated,
  Meta as ThisMeta,
  Admits,
  InputAdmits,
} from "./Types";

/**
 * Buildable `number` recipe: a range/distribution (`whereby`, absent for the
 * full-range bare form), `integer` for whole-number semantics, a `sequence`
 * counter, or opaque production via `as`. `construct()` derives `fabricate`
 * from this data — no variant carries its own closure until it's built.
 *
 * `$Meta` is generic (defaulting to the full `Meta` union) so builder return
 * types stay narrow — e.g. `T.number.integer.sequence` types as `Schema<{
 * sequence: true; integer: true }>`, not the widened `Schema`, so a downstream
 * conditional (`ToTypeBox`) can still tell an integer schema apart from a bare
 * one.
 */
export interface Schema<
  $Meta extends ThisMeta = ThisMeta,
  $Adaptations extends Adaptations = {},
> extends Core<$Meta, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `whereby`/`integer`/`sequence` forward, not discarding them, so a later
   * `.as(...)` (or future validation of `produce`) still has them to check
   * against.
   */
  as: (produce: Produce<Fabricated>) => Schema<$Meta, $Adaptations>;

  /**
   * State what adapters admit for this schema, widening what `whereby` draws —
   * see `string/Schema.ts`'s `admits` for the full contract. An omitted
   * `whereby` end is unbounded, so only no limit admits it.
   */
  admits: (
    admitted: InputAdmits,
  ) => Schema<$Meta & { admits: Admits }, $Adaptations>;

  /**
   * Check that this schema's fabricated value type is assignable to `$Target`.
   * Identity at runtime; the target is not carried into later chained calls —
   * see `object/Schema.ts`'s `satisfies`.
   */
  satisfies<$Target>(
    this: this & SatisfiesThis<Fabricated, $Target>,
  ): Schema<$Meta, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$Meta, $Adaptations>>) => $Returnable,
  ) => Schema<
    $Meta,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $Meta extends ThisMeta,
  $Adaptations extends Adaptations = {},
>(schema: Core<$Meta, $Adaptations>): Schema<$Meta, $Adaptations> {
  return {
    ...schema,
    [Kind]: "number",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    admits: (admitted) =>
      Schema({
        ...schema,
        [Meta]: { ...schema[Meta], admits: toAdmits(schema[Meta], admitted) },
      }),
    satisfies,
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
