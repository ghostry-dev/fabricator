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
import type { Core, Fabricated, Meta as ThisMeta } from "./Types";

/**
 * Buildable `Date` recipe: a range/distribution (`whereby`, absent for the
 * full-range bare form), optionally scoped by `mode` to `"past"` (up to now) or
 * `"future"` (from now), or opaque production via `as`.
 *
 * `$Meta` is generic (defaulting to the full `Meta` union) so builder return
 * types stay narrow — e.g. `T.date.past` types as `Schema<{ mode: "past" }>`,
 * not the widened `Schema` — see `number/Schema.ts`.
 */
export interface Schema<
  $Meta extends ThisMeta = ThisMeta,
  $Adaptations extends Adaptations = {},
> extends Core<$Meta, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `mode`/`whereby` forward, not discarding them, so a later `.as(...)` (or
   * future validation of `produce`) still has them to check against.
   */
  as: (produce: Produce<Fabricated>) => Schema<$Meta, $Adaptations>;

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
    [Kind]: "date",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    satisfies,
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
