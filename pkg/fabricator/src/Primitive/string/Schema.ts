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
 * Buildable `string` recipe: length/composition (`whereby` — required, unlike
 * `number`/`date`; no natural bound to fuzz a length to), or opaque production
 * via `as`.
 *
 * `$Meta` is generic (defaulting to the full `Meta` union) so builder return
 * types stay narrow — see `number/Schema.ts`. `$Adaptations` is generic for the
 * same reason, threaded through every builder method so an adaptation survives
 * chaining (see `adapt`).
 */
export interface Schema<
  $Meta extends ThisMeta = ThisMeta,
  $Adaptations extends Adaptations = {},
> extends Core<$Meta, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `whereby` forward, not discarding it, so a later `.as(...)` (or future
   * validation of `produce`) still has it to check against.
   */
  as: (
    produce: Produce<Fabricated>,
    hints?: JsonSchema,
  ) => Schema<$Meta, $Adaptations>;

  /**
   * Override what this schema maps to in one external schema library, for a
   * contract no native kind expresses — a `string` that is really an email, a
   * `date` that must cross the wire as an ISO string. Canonical `adapt`; every
   * other kind's method is the same and points here.
   *
   * `adapter` is the adapter itself, imported from its package
   * (`schema.adapt(typebox, ...)`), not a name. The key this adaptation is
   * filed under comes from it, so naming the wrong adapter is an import error
   * rather than an entry nothing looks up. Several libraries = several chained
   * calls; each replaces only its own adapter's entry.
   *
   * Additive to fabrication: only an adapter reads `[Adaptation]`, so the
   * schema still produces exactly what it did. `Static<ToTypeBox<...>>` and
   * `fabricate()` can therefore disagree — telling an external library
   * something the fabricator doesn't honor is the point; keeping them
   * compatible is the caller's business.
   *
   * Every other builder method carries the map forward, so `.adapt(...)`
   * composes in any order with `.as(...)`/`.whereby(...)`/`.extend(...)`.
   *
   * `produce` receives an {@link Adapting} — `{ schema, meta }` for the schema
   * being adapted. An adaptation deriving from this kind's config destructures
   * `meta`; one building on what it replaces destructures `schema`. See that
   * type; they describe one object, `meta` being that `schema`'s `[Meta]`.
   *
   * That schema carries whichever same-adapter adaptation it replaced
   * (`Adapter/Core.ts`'s `layer`) — so `toTypeBox(schema)` inside one resolves
   * to the previous layer, or this kind's ordinary mapping, and
   * `Type.Intersect([toTypeBox(schema), extra])` reads as it looks. `[Kind]`,
   * `[Meta]`, and `[Adaptation]` are always on it; builder methods are not,
   * when the schema was normalized into an enclosing `object`/`array` field
   * (`toSchema`).
   *
   * `$Returnable` is inferred from `produce`'s return position, not a
   * constraint on the argument, so the adaptation keeps its precise type for
   * the adapter to read off `[Adaptation]`. Bounding it by
   * `ReturnType<$Adapter["convert"]>` rejects a producer returning something
   * that adapter could never emit, at the call site rather than silently at
   * conversion.
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
    [Kind]: "string",
    as: (produce, hints) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce, hints } }),
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
