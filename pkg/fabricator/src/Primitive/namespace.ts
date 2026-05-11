/**
 * The kind modules as a single namespace object — `Primitive.boolean`,
 * `Primitive.object.compute`, and so on.
 *
 * Each kind's `Types.ts` must stay type-only. A value export in the same
 * file as `export type Fabricated = boolean` (or `string`) makes that
 * module a value module; `export * as boolean` here then resolves
 * `boolean` to this namespace rather than the TypeScript primitive, which
 * drops `[Kind]`/`[Meta]` off `Core`. Named outcome lists and string's
 * character tables live in `Outcomes.ts`.
 *
 * A top-level `import * as boolean` is the same trap without needing a
 * cycle through this file. Prefer `import { Primitive }`.
 *
 * Consumed as `import { Primitive }` from `./index` (or from
 * `@ghostry/fabricator/internal`). Do not add this object to the
 * registry: `T.Primitive` is not a builder.
 */
export * as always from "./always";
export * as array from "./array";
export * as bigint from "./bigint";
export * as boolean from "./boolean";
export * as choice from "./choice";
export * as date from "./date";
export * as enum from "./enum";
export * as null from "./null";
export * as nullable from "./nullable";
export * as nullish from "./nullish";
export * as number from "./number";
export * as object from "./object";
export * as opaque from "./opaque";
export * as record from "./record";
export * as recursive from "./recursive";
export * as string from "./string";
export * as symbol from "./symbol";
export * as tuple from "./tuple";
export * as undefinable from "./undefinable";
export * as undefined from "./undefined";
