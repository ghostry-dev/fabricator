import type { Attribution } from "@ghostry/fabricator";
import { initialize, registry as T } from "@ghostry/fabricator";
import type {
  Constructor,
  ConstructorOptions,
  Enumerable,
  Salt,
} from "@ghostry/fabricator/internal";
import { toRandomSource } from "@ghostry/fabricator/internal";

/**
 * A Schema defined here, in its own file, but never built here — used by
 * `random.test.ts` to exercise that `construct()`'s randomness is attributed to
 * wherever _it_ is called from, not to this Schema's declaration site (a Schema
 * carries no construction-site information of its own; only `construct()` binds
 * randomness, and only at the moment it runs).
 */
export function sharedSchema() {
  return T.object({
    n: T.number,
    s: T.string.whereby({ length: { max: 16 } }),
  });
}

/**
 * Constructs and fabricates `new Fabricator(sharedSchema(), options)` from
 * _this_ file — used opposite a same-shaped call from `random.test.ts` to prove
 * that ordinary call-site attribution keeps two files' builds apart, with or
 * without an `options.salt`. Naming a salt forks the source but says nothing
 * about rooting, so both call sites still resolve their own file and must
 * diverge.
 */
export function fabricateSharedSchemaHere(
  Fabricator: Constructor,
  options?: ConstructorOptions,
) {
  return new Fabricator(sharedSchema(), options).fabricate();
}

/**
 * A leaf schema. `T.number` is what `traceSharedSchemaHere` /
 * `Attribution.test.ts`'s ascent assertions need — a Fabricator whose own
 * `.trace.file` is observable.
 */
export function leafSchema() {
  return T.number;
}

/**
 * Constructs `new Fabricator(leafSchema())` from _this_ file and reads its
 * `.trace` back — used opposite a same-shaped call from `Attribution.test.ts`
 * to prove relativization ascends correctly through a real stack frame (not a
 * synthetic one) when `initialize()`'s attribution root sits in a different
 * directory than this file.
 */
export function traceSharedSchemaHere(Fabricator: Constructor) {
  return new Fabricator(leafSchema()).trace;
}

/**
 * Calls `initialize()` from _this_ file (`test/fixtures/`), so a test in a
 * sibling directory can pin the escape-upward case under the default `{ kind:
 * "call site" }` policy: the resolved root is `test/fixtures/`, and a
 * construction from anywhere outside it resolves to an ascending `../…` path
 * rather than an absolute one.
 *
 * Deliberately not `return initialize(config);` (nor `const instance =
 * initialize(config); return instance;`, which turns out to be just as
 * eligible) — under `bun test`, a function this trivial gets its own frame
 * elided from the captured stack entirely, verified directly:
 * `resolveCallerFile()`'s raw stack jumped straight from `initialize` to the
 * frame that _called_ `initializeHere`, skipping this function altogether, with
 * both forms above. Rebuilding the return value as an object literal is enough
 * to keep this function real rather than transparent, so the frame it exists to
 * provide is actually present to resolve against. This is the same class of
 * stack-fragility `T.recursive`'s own doc comment already calls out for
 * `Array.from`/`.map`'s native frames — attribution by call stack is inherently
 * sensitive to how a particular engine/bundler represents a given call, which
 * is exactly why a _caller_ can always fall back to `{ kind: "rooted" }` for
 * anything that must be reliable regardless.
 */
export function initializeHere(config?: { attribution?: Attribution }) {
  const instance = initialize(config);
  return {
    T: instance.T,
    Fabricator: instance.Fabricator,
    salt: instance.salt,
    fork: instance.fork,
  };
}

/**
 * Calls `toRandomSource({ salt })` from _this_ file (`test/fixtures/`) under
 * the default `{ kind: "call site" }` policy, so a test in a sibling directory
 * can fork the result and prove the fork inherits _this_ resolved root rather
 * than re-resolving `"call site"` at the moment `.fork()`/ `.toRoot()` is
 * actually called — see `RandomSource.fork`'s own doc comment
 * (`Random/Types.ts`).
 *
 * Rebuilds the return value as an object literal for the same reason
 * `initializeHere` does, immediately above — a function this trivial otherwise
 * risks having its own frame elided under `bun test`.
 */
export function toRandomSourceHere(salt: Salt) {
  const source = toRandomSource({ salt, clock: 0 });
  return { salt: source.salt, toRoot: source.toRoot, fork: source.fork };
}

/**
 * A schema with one enumerable axis, defined here but never enumerated here —
 * the `combinatorial`/`coverage` analogue of `sharedSchema` above.
 */
export function enumerableSharedSchema() {
  return T.object({ e: T.enum.uniform(["a", "b", "c"]) });
}

/**
 * Calls `combinatorial(enumerableSharedSchema())` from _this_ file — used
 * opposite a same-shaped call from the test file to prove enumeration
 * reproduces regardless of which file it's called from, the enumeration
 * analogue of `fabricateSharedSchemaHere` above.
 */
export function combinatorialFromHere(combinatorial: Enumerable): unknown[] {
  return [...combinatorial(enumerableSharedSchema())];
}

/**
 * The `coverage` counterpart to `combinatorialFromHere` above.
 */
export function coverageFromHere(coverage: Enumerable): unknown[] {
  return [...coverage(enumerableSharedSchema())];
}
