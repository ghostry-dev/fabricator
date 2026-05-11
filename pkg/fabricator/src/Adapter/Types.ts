import type { Adaptation, Meta } from "../Types";

/**
 * One adapter's override for one schema, *as stored* in `[Adaptation]` —
 * the loosest signature the mechanism needs. An adapter states its real
 * return type on {@link Adapter.convert}, and `.adapt(...)` checks a
 * supplied adaptation against that; nothing here reads either end.
 *
 * Not the shape a caller writes: a kind's `.adapt(...)` takes a producer
 * of {@link Adapting}, which `Adapter/Core.ts`'s `withAdaptations`/
 * `mergeAdaptations` wrap into this one entry point-side. The stored
 * form stays schema-taking so `patched`/`layer` treat an incoming
 * producer and a prior layered entry as one type, and so
 * `AdaptationEntry`'s `(schema: any) => $Returnable` is an accurate
 * account of what a schema carries.
 */
export type SchemaAdaptation = (schema: any) => unknown;

/**
 * What a kind's `.adapt(adapter, produce)` hands its producer: the schema
 * being adapted, and that schema's `[Meta]` — one object rather than two
 * parameters, so destructuring picks whichever half is needed and neither
 * is reachable only through a well-known symbol.
 *
 * `schema` carries whichever adaptation for this same adapter it
 * replaced, absent at the bottom of the stack (see `Adapter/Core.ts`'s
 * `layer`) — so `toTypeBox(schema)` inside a producer resolves to the
 * previous layer, or to the kind's ordinary mapping when there is none.
 * `meta` is read off that same substituted schema, so the two keys
 * describe one object.
 *
 * `meta`'s shape is the kind's own config blob, derived by indexed
 * access rather than named separately so no kind states its own `Meta`
 * twice in an `adapt` signature. **Readable but not stabilized**: an
 * adaptation may read it; a kind stays free to restructure it — nothing
 * outside a kind's own files should *interpret* another kind's `[Meta]`.
 *
 * A kind with no bare-form default carries no `[Meta]` at runtime until
 * configured (`string`/`bigint`'s registry exports — see "Anatomy of a
 * primitive"), so `meta` can be `undefined` there despite this type.
 * Same imprecision `Schema<$Meta>` already states, and why the TypeBox
 * adapter reads `[Meta]` defensively for those kinds.
 */
export type Adapting<$Schema extends { [Meta]: unknown }> = {
  readonly schema: $Schema;
  readonly meta: $Schema[typeof Meta];
};

/**
 * What a Schema's `[Adaptation]` holds: each adapter's override, under
 * that adapter's own key.
 *
 * Open rather than a closed registry of known libraries: an adapter is
 * a value (see {@link Adapter}), not a name this package knows. Nothing
 * has to be declared for a third party's adapter to work, and two
 * adapters for different versions of the same library collide with
 * nothing.
 */
export type Adaptations = { readonly [key: string]: SchemaAdaptation };

/**
 * An {@link Adaptations} update as `withAdaptations` accepts it. Identical
 * except that an explicitly-`undefined` entry *removes* that adapter's
 * override — how the layering hands an adaptation the schema it is
 * adapting with its own entry replaced by the previous one, or absent
 * at the bottom of the stack.
 *
 * Not what a kind's `.adapt(...)` accepts: removal is an internal need
 * of the layering, and letting a caller express it would produce a
 * `[Adaptation]` type that `exactOptionalPropertyTypes` rejects against
 * {@link Adaptations}.
 */
export type Patch = { readonly [key: string]: SchemaAdaptation | undefined };

/**
 * How an adapter recurses into a nested schema — handed to
 * {@link Adapter.convert} by `Adapter/Core.ts`'s `drive` rather than
 * being the adapter's own private recursion, so every nested node goes
 * back through the adaptation lookup, not only the outermost one.
 *
 * `$Context` is the adapter's own, and opaque here: an adapter that
 * needs to carry something down its recursion (the enclosing
 * `T.recursive`'s placeholder, say) threads it through unchanged.
 * `$Returnable` is likewise the adapter's own — stated so a nested
 * node's result drops straight into a composite
 * (`Type.Array(recurse(element, context))`) with no cast at any call
 * site.
 */
export type Recurse<$Context, $Returnable> = (
  schema: any,
  context: $Context,
) => $Returnable;

/**
 * An adapter to one external schema library: a plain value, imported
 * directly by whoever adapts a schema (`schema.adapt(typebox, ...)`)
 * and by whoever converts one. Nothing to register — no global
 * interface to declaration-merge, and no name chosen anywhere but here.
 *
 * `key` is the adapter's `[Adaptation]` namespace. Read off the value
 * as a literal type, so a wrong one is an import error rather than an
 * entry nothing looks up. Give it something collision-proof — a package
 * specifier, versioned when a library's major rewrite means two
 * adapters can coexist.
 *
 * `convert`'s declared return type is this adapter's external bound:
 * the type every `.adapt(...)` against it must produce, and why an
 * adaptation that returns the wrong thing fails at the call site.
 *
 * Deliberately *not* carrying the adapter's type-level mapping. An
 * adapter package declares its own conversion entry point with its own
 * return type (`toTypeBox<$S>(schema: $S): ToTypeBox<$S>`), so nothing
 * has to compute a type-level mapping out of a stored value — which
 * would need the interface-member-lookup encoding `ValueOf`'s
 * `$Bindings` uses, for no gain.
 */
export interface Adapter<
  $Key extends string = string,
  $Context = unknown,
  $Returnable = unknown,
> {
  readonly key: $Key;
  convert(
    schema: any,
    recurse: Recurse<$Context, $Returnable>,
    context: $Context,
  ): $Returnable;
}

/**
 * The adaptations a Schema (or a built Fabricator, which carries them
 * identically) declares, or `{}` for one that declares none.
 *
 * The two steps — extract the map, then match against it — are
 * load-bearing, and why no adapter matches
 * `{ [Adaptation]?: Record<Key, ...> }` directly. Every kind's `Core`
 * declares `[Adaptation]` as *optional*, and a conditional matching an
 * optional property against a schema that lacks it entirely still
 * *succeeds*, inferring `unknown` (the same behavior `ValueOf` relies
 * on for `[Produces]`) — so a direct match would resolve every
 * unadapted schema to whatever the adapter's adaptation branch
 * produces. Constraining the `infer` sends that case here, to `{}`,
 * which then fails each adapter's `Record<Key, ...>` check as it
 * should.
 */
export type AdaptationsOf<$Schema> = $Schema extends {
  [Adaptation]?: infer $Adaptations extends Adaptations;
}
  ? $Adaptations
  : {};

/**
 * `$Prior` with `$Map` applied: an adapter named in `$Map` takes its new
 * entry; one it doesn't name is carried forward. `Omit` first (rather
 * than a plain `$Prior & $Map`) so a replaced entry is genuinely
 * replaced — intersecting two call signatures for the same adapter
 * would produce an overload, from which an adapter's `infer` would
 * read whichever member TypeScript happens to resolve last.
 */
export type WithAdaptations<
  $Prior extends Adaptations,
  $Map extends Adaptations,
> = Omit<$Prior, keyof $Map> & $Map;
