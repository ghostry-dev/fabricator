import { registry as T } from "@ghostry/fabricator";
import type {
  Constructor,
  ConstructorOptions,
  Enumerable,
} from "@ghostry/fabricator/internal";

/**
 * A Schema defined here, in its own file, but never built here. A Schema
 * carries no construction-order information of its own; only `construct()`
 * binds randomness.
 */
export function sharedSchema() {
  return T.object({
    n: T.number,
    s: T.string.whereby({ length: { max: 16 } }),
  });
}

/**
 * Constructs and fabricates `new Fabricator(sharedSchema(), options)` from this
 * module. Used to show that module boundaries do not partition a source's one
 * construction counter.
 */
export function fabricateSharedSchemaHere(
  Fabricator: Constructor,
  options?: ConstructorOptions,
) {
  return new Fabricator(sharedSchema(), options).fabricate();
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
 * reproduces regardless of where it is invoked.
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
