import type { AnySchema } from "../Schema/Types";
import { Adaptation, Meta } from "../Types";
import type {
  Adaptations,
  AdaptationsOf,
  Adapter,
  Adapting,
  Patch,
  Recurse,
  SchemaAdaptation,
  WithAdaptations,
} from "./Types";

type OverrideSchemaAdaptation<
  $Schema extends object,
  $Map extends Adaptations,
> = Omit<$Schema, typeof Adaptation> & {
  readonly [Adaptation]?: WithAdaptations<AdaptationsOf<$Schema>, $Map>;
};

/**
 * One adapter's entry, keyed by `$Adapter["key"]`. Written as a mapped
 * type rather than built inline: a computed key in an object literal
 * (`{ [adapter.key]: produce }`) widens to a `string` index signature,
 * which no adapter's literal-keyed dispatch matches.
 */
export type AdaptationEntry<$Adapter extends Adapter, $Returnable> = {
  readonly [$K in $Adapter["key"]]: (schema: any) => $Returnable;
};

/**
 * A copy of `schema` carrying `produce` as `adapter`'s adaptation:
 * that adapter's prior entry is replaced (via {@link layer}), every
 * other adapter's is carried forward. Every kind's `.adapt(...)` is a
 * call to this, re-typed to that kind's own
 * `Schema<..., WithAdaptations<...>>`.
 *
 * Takes the adapter and producer separately rather than a prebuilt map
 * so the key stays a literal, per {@link AdaptationEntry}. The return
 * type mirrors the merge (rather than handing back `$Schema`) so call
 * sites need no cast: `AdaptationsOf<$Schema>` recovers the prior map
 * from whichever kind's `Core` was passed in.
 */
export function withAdaptations<
  const $Schema extends object,
  const $Adapter extends Adapter,
  $Returnable,
>(
  schema: $Schema,
  adapter: $Adapter,
  produce: (adapting: Adapting<any>) => $Returnable,
) {
  return patched(schema, {
    [adapter.key]: toSchemaAdaptation(produce),
  }) as OverrideSchemaAdaptation<
    $Schema,
    AdaptationEntry<$Adapter, $Returnable>
  >;
}

/**
 * {@link withAdaptations} at the map level, for a kind that keeps its
 * adaptations beside its schema rather than on it — `object`, whose
 * `extend`/`refine`/`override` each rebuild the schema from scratch, so
 * `Registry.ts`'s `make` has to thread the map through explicitly (see
 * its `adapt`).
 *
 * `undefined` rather than an empty map when there is nothing to carry,
 * for the same reason `patched` drops the symbol: an absent map and an
 * empty one mean the same thing, and only one of them should exist at
 * runtime.
 */
export function mergeAdaptations<
  $Prior extends Adaptations,
  const $Adapter extends Adapter,
  $Returnable,
>(
  prior: $Prior | undefined,
  adapter: $Adapter,
  produce: (adapting: Adapting<any>) => $Returnable,
) {
  return patched(
    { [Adaptation]: prior },
    { [adapter.key]: toSchemaAdaptation(produce) },
  )[Adaptation] as
    WithAdaptations<$Prior, AdaptationEntry<$Adapter, $Returnable>> | undefined;
}

/**
 * A caller's producer as the schema-taking form everything downstream
 * stores and calls (see {@link SchemaAdaptation}): the single point
 * where a schema is split into the `{ schema, meta }` an `Adapting`
 * producer destructures.
 *
 * Applied where a producer *enters* the mechanism, not where one is
 * called, so `patched`/`layer` pass exactly one kind of function — an
 * incoming producer and a prior layered entry stay the same type, and
 * the layering below needs no knowledge of the caller-facing shape.
 *
 * `meta` is read at call time, off whichever schema `layer` hands
 * down, not closed over from the schema being adapted now — so a
 * producer sees the *current* config after a chained `.whereby(...)`,
 * for the same reason `layer`'s wrapper takes the schema the adapter
 * is walking.
 */
function toSchemaAdaptation<$Returnable>(
  produce: (adapting: Adapting<any>) => $Returnable,
): (schema: AnySchema) => $Returnable {
  return (schema) => produce({ schema, meta: schema[Meta] });
}

/**
 * {@link withAdaptations}' untyped core, which additionally accepts the
 * removal a {@link Patch} can express — needed only by the layering
 * below, never by a caller adapting a schema. The symbol is dropped
 * entirely when the map empties, so an unadapted schema never grows an
 * empty one, keeping what each adapter's `AdaptationsOf` dispatch sees
 * in step with the runtime.
 */
function patched<$Schema extends { [Adaptation]?: Adaptations | undefined }>(
  schema: $Schema,
  patch: Patch,
): $Schema {
  const prior = schema[Adaptation];
  const merged: Record<string, SchemaAdaptation> = { ...prior };

  for (const [key, adaptation] of Object.entries<SchemaAdaptation | undefined>(
    patch,
  )) {
    if (adaptation === undefined) delete merged[key];
    else merged[key] = layer(key, adaptation, merged[key]);
  }

  if (Object.keys(merged).length === 0) {
    const { [Adaptation]: _, ...rest } = schema;
    return rest as $Schema;
  }

  return { ...schema, [Adaptation]: merged };
}

/**
 * Sit one adapter's entry *on top of* whatever it replaces: the new
 * adaptation is called with the schema rewritten to carry the previous
 * adaptation instead of itself. An adaptation that wants to build on
 * what it replaced just adapts its own argument
 * (`Type.Intersect([toTypeBox(schema), extra])`); at the bottom of the
 * stack — entry removed, not replaced — that argument falls through
 * to the adapter's ordinary per-kind mapping.
 *
 * Handled here rather than in each adapter: a schema holds one
 * adaptation per adapter, so an adaptation handed its own schema
 * unchanged would re-enter itself forever instead of resolving to
 * what it replaced.
 *
 * The wrapper takes the schema the adapter is walking rather than
 * closing over the one being adapted now, so an adaptation reading
 * `[Meta]` still sees the *current* config after a chained
 * `.whereby(...)`/`.as(...)`.
 *
 * Operates purely on the stored, schema-taking form — the substituted
 * schema built here is what {@link toSchemaAdaptation} later splits
 * into a producer's `{ schema, meta }`, which is why `meta` describes
 * the same layer `schema` does rather than the one being replaced.
 */
function layer(
  key: string,
  adaptation: SchemaAdaptation,
  prior: SchemaAdaptation | undefined,
): SchemaAdaptation {
  return (schema) => adaptation(patched(schema, { [key]: prior }));
}

/**
 * Walk `schema` with `adapter`, resolving each node to its external
 * counterpart. Every adapter's entry point is a call to this.
 *
 * The adaptation lookup lives here, ahead of the adapter's own
 * per-kind dispatch, so an explicit adaptation wins over the kind's
 * mapping — and here rather than in each adapter so it applies at
 * *every* node the walk reaches, not just the one it started from.
 * That is why an adapter recurses through the {@link Recurse} it is
 * handed rather than calling its own `convert` again: a nested
 * `object` field, `array` element, or `choice` option gets the same
 * treatment as the root.
 *
 * Paired with {@link layer}: together they make `toTypeBox(schema)`
 * *inside* an adaptation resolve to the layer that adaptation replaced
 * instead of re-entering itself. This reads the entry; `layer` already
 * substituted the previous one into the argument. Splitting the two
 * across packages is how they drift.
 */
export function drive<$Context, $Returnable>(
  adapter: Adapter<string, $Context, $Returnable>,
  schema: { [Adaptation]?: Adaptations },
  context: $Context,
): $Returnable {
  const adaptation = schema[Adaptation]?.[adapter.key];
  if (adaptation) return adaptation(schema) as $Returnable;

  return adapter.convert(
    schema,
    (child, childContext) => drive(adapter, child, childContext),
    context,
  );
}
