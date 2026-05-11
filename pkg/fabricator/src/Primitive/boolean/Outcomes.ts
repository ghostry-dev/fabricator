/**
 * Weight *keys* for `.weighted(...)`, not the boolean values themselves.
 * Derived so `assertDrawableKeyedWeights` and `Enumeration/Plan.ts`
 * cannot drift from the named outcome set.
 *
 * Lives here rather than `Types.ts` so that file stays type-only. A
 * value export alongside `export type Fabricated = boolean` makes the
 * module a value module, and `export * as boolean` in
 * `Primitive/namespace.ts` then resolves `boolean` to the namespace —
 * a cycle that drops `[Kind]`/`[Meta]` off `Core`.
 */
export const outcomes = ["true", "false"] as const;
