import type {
  Buildable,
  Constructor,
  ConstructorOptions,
} from "@ghostry/fabricator/internal";

/**
 * Rebuilds `schema` from a captured trace in _this_ file, so a round-trip
 * assertion in `Trace.test.ts` is not file-bound.
 */
export function fabricateFromTrace(
  Fabricator: Constructor,
  schema: Buildable,
  options: ConstructorOptions,
) {
  return new Fabricator(schema, options).fabricate();
}
