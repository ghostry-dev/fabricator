/**
 * The kind modules as a single namespace object — `Primitive.boolean`,
 * `Primitive.object.compute`, and so on.
 *
 * Each kind's `Types.ts` must stay type-only. A value export in the same file
 * as `export type Fabricated = boolean` (or `string`) makes that module a value
 * module; `export * as boolean` here then resolves `boolean` to this namespace
 * rather than the TypeScript primitive, which drops `[Kind]`/`[Meta]` off
 * `Core`. Named outcome lists and string's character tables live in
 * `Outcomes.ts`.
 *
 * A top-level `import * as boolean` is the same trap without needing a cycle
 * through this file. Prefer `import { Primitive }`.
 *
 * Consumed as `import { Primitive }` from `./index` (or from
 * `@ghostry/fabricator/internal`). Do not add this object to the registry:
 * `T.Primitive` is not a builder.
 */
export * as always from "./always/index.ts";
export * as array from "./array/index.ts";
export * as bigint from "./bigint/index.ts";
export * as boolean from "./boolean/index.ts";
export * as choice from "./choice/index.ts";
export * as date from "./date/index.ts";
export * as derive from "./derive/index.ts";
export * as enum from "./enum/index.ts";
export * as null from "./null/index.ts";
export * as nullable from "./nullable/index.ts";
export * as nullish from "./nullish/index.ts";
export * as number from "./number/index.ts";
export * as object from "./object/index.ts";
export * as opaque from "./opaque/index.ts";
export * as record from "./record/index.ts";
export * as recursive from "./recursive/index.ts";
export * as string from "./string/index.ts";
export * as symbol from "./symbol/index.ts";
export * as tuple from "./tuple/index.ts";
export * as undefinable from "./undefinable/index.ts";
export * as undefined from "./undefined/index.ts";
