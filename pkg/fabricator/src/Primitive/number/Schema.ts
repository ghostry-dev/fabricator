import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import type { Core, Fabricated, JsonSchema, Meta as ThisMeta } from "./Types";

/**
 * Buildable `number` recipe: a range/distribution (`whereby`, absent for
 * the full-range bare form), `integer` for whole-number semantics, a
 * `sequence` counter, or opaque production via `as`. `construct()` derives
 * `fabricate` from this data — no variant carries its own closure until
 * it's built.
 *
 * `$Meta` is generic (defaulting to the full `Meta` union) so builder
 * return types stay narrow — e.g. `T.number.integer.sequence` types as
 * `Schema<{ sequence: true; integer: true }>`, not the widened `Schema`, so
 * a downstream conditional (`ToTypeBox`) can still tell an integer schema
 * apart from a bare one.
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
  as: (
    produce: Produce<Fabricated>,
    hints?: JsonSchema,
  ) => Schema<$Meta, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema
   * libraries — see `string/Schema.ts`'s `adapt` for the full contract.
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
    as: (produce, hints) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce, hints } }),
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
