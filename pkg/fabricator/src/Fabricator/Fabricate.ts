import { toEffectiveSource } from "../Instance/Stack/Visible";
import type { Ancestry, Stack } from "../Instance/Types";
import type { RandomSource } from "../Random/Types";
import { FabricatorError } from "../Error";
import type { AnySchema, Fabricated } from "../Schema/Types";
import { Kind } from "../Types";
import type { Constructor } from "./Constructor";
import type { NaiveFabricator } from "./Types";

/**
 * `new Fabricator(schema).fabricate()` in one call, without a build per call:
 * the first call with a given schema in a given scope builds, and every later
 * one continues that same Fabricator's streams. A repeated call therefore takes
 * no construction ordinal, so it shifts nothing built after it.
 *
 * The key is the schema's identity. A schema held in a variable — including an
 * overridden one, `const Admin = User.override({ ... })` — is reused. One
 * written at the call site — `fabricate(User.override({ ... }))`, an inline
 * `.whereby(...)` — is a new object on every call, so every call builds and
 * takes an ordinal, exactly as `new Fabricator(...).fabricate()` would.
 *
 * A Schema only, never a built Fabricator: given one, neither reusing it nor
 * caching a fresh build of it is the obvious reading, so the type rejects it
 * (`fabricate?: never` — a Fabricator otherwise matches `AnySchema`
 * structurally), and the runtime throws `FabricateArgumentError` for it or for
 * anything else that is not a Schema.
 *
 * Identity rather than structure on purpose: a schema can carry functions
 * (`.as` producers, compute and derive resolvers, `T.opaque`) and `always`/
 * `enum` hold arbitrary values, none of which has a sound structural equality.
 */
export type Fabricate = <
  const $Schema extends AnySchema & { readonly fabricate?: never },
>(
  schema: $Schema,
) => Fabricated<$Schema>;

/**
 * Whether `fabricate` may take `candidate`: an object carrying a `[Kind]` tag,
 * and not a built Fabricator. A bare builder that is a function (`T.array`,
 * `T.recursive`) fails the first test; one that is an object but has no
 * `[Kind]` fails the second.
 */
function isSchema(candidate: unknown): candidate is AnySchema {
  if (typeof candidate !== "object" || candidate === null) return false;
  if (typeof (candidate as Partial<AnySchema>)[Kind] !== "string") return false;
  return !("fabricate" in candidate);
}

/**
 * Every cached Fabricator of one lineage, keyed first by the `RandomSource`
 * whose ordinal its build took, then by the schema it was built from. Both maps
 * are weak: a per-test `wrap`'s source is released with its scope, and its
 * entries with it.
 */
export type FabricatorCache = WeakMap<
  RandomSource,
  WeakMap<AnySchema, NaiveFabricator<unknown>>
>;

/**
 * Bind `fabricate` to one instance — the same `(source, stack, ancestry)` its
 * `construct` closes over — and to its lineage's shared `fabricatorCache`.
 *
 * **Keyed by source before schema.** The source is the one `resolveScope` would
 * take an ordinal from (`toEffectiveSource`): the innermost visible `wrap`
 * frame's, else this instance's. Keyed by schema alone, a module-level `User`
 * fabricated in one test would carry its stream into the next, so a test's data
 * would depend on which tests ran before it — the order-dependence each
 * per-test `wrap` exists to remove. Keyed by source, every fresh scope starts
 * empty.
 *
 * **Shared across the lineage, not held per instance.** Inside a `wrap`, the
 * receiver and the wrap's own scope both resolve the frame's source, and must
 * reach the same cached Fabricator — otherwise interleaving
 * `instance.fabricate(S)` with `scope.fabricate(S)` would draw two separate
 * sequences, where `new Fabricator` keeps the implicit and explicit routes in
 * agreement (`test/Wrap.test.ts`). Two lineages never resolve the same source,
 * so one map per lineage shares nothing between `initialize()` calls.
 *
 * The source is resolved and the build made in one synchronous call, so
 * `construct` resolves the same frame this function keyed by.
 */
export function Fabricate(
  construct: Constructor,
  source: RandomSource,
  stack: Stack,
  ancestry: Ancestry,
  fabricatorCache: FabricatorCache,
): Fabricate {
  function cacheFor(
    base: RandomSource,
  ): WeakMap<AnySchema, NaiveFabricator<unknown>> {
    const existing = fabricatorCache.get(base);
    if (existing) return existing;

    const created = new WeakMap<AnySchema, NaiveFabricator<unknown>>();
    fabricatorCache.set(base, created);
    return created;
  }

  function fabricatorFor(schema: AnySchema): NaiveFabricator<unknown> {
    if (!isSchema(schema))
      throw new FabricatorError.FabricateArgumentError(schema);

    const cache = cacheFor(toEffectiveSource(source, stack, ancestry));
    const existing = cache.get(schema);
    if (existing) return existing;

    const built: NaiveFabricator<unknown> = new construct(schema);
    cache.set(schema, built);
    return built;
  }

  return <const $Schema extends AnySchema & { readonly fabricate?: never }>(
    schema: $Schema,
  ): Fabricated<$Schema> =>
    fabricatorFor(schema).fabricate() as Fabricated<$Schema>;
}
