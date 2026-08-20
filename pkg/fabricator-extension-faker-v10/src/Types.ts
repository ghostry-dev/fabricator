import type { Faker } from "@faker-js/faker";
import type { registry } from "@ghostry/fabricator";
import type { Primitive } from "@ghostry/fabricator/internal";
import type { FakerModules } from "./FakerModules/Types";

/**
 * What the mirror needs from whichever registry it is merged into — a
 * structural requirement, not `typeof registry` itself, so an already-extended
 * registry still satisfies it.
 */
export type Registry = Pick<
  typeof registry,
  | "array"
  | "bigint"
  | "boolean"
  | "date"
  | "enum"
  | "number"
  | "object"
  | "opaque"
  | "string"
  | "tuple"
>;

/**
 * Every module the mirror covers, intersected with `keyof Faker` so every
 * downstream `Faker[$M]` indexing is sound. `FakerModules/Types.ts` is the
 * source of truth — `helpers` is absent from it deliberately (deviation policy
 * in `CLAUDE.md`'s "The faker extension"), so this type excludes it without
 * saying so twice.
 *
 * `test/index.types.test.ts`'s `_ModulesExhaustive` holds this to faker's own
 * module list, naming each exclusion, so a module added upstream fails `check`
 * rather than going quietly unmirrored.
 */
export type ModuleName = keyof FakerModules & keyof Faker;

/**
 * A module's method names, read off the declared surface rather than `keyof
 * Faker[$M]`, so this stays correct if the mirror ever stops covering a module
 * exhaustively. It does today — `test/index.types.test.ts`'s
 * `MethodsExhaustive<$M>` asserts the two are equal per module — but that is an
 * assertion about the surface, not a property of this type.
 */
export type MethodName<$M extends ModuleName> = keyof FakerModules[$M]
  & keyof Faker[$M];

/**
 * The `faker` namespace on an extended registry: every module the mirror covers
 * — with `color` additionally carrying the 7 split text/channels nodes
 * alongside its 4 ordinary ones — plus the `use` escape hatch.
 *
 * The module half is `FakerModules/Types.ts`, a hand-maintained _literal_ type
 * rather than a mapped type over the builders. Performance, not style: a mapped
 * type must instantiate every member to resolve any one of them, so having the
 * derived form in the program exhausted TypeScript 5's 5,000,000-instantiation
 * budget and made every `toTypeBox(...)` call fail with TS2589. See that file's
 * header. This repo's `check` runs TypeScript 7, whose budget is larger — `bun
 * run check` passing is _not_ evidence a derived form would be affordable for
 * consumers. `check:ts5` is.
 *
 * Both halves are object-literal types, never `interface`s: only a literal gets
 * an implicit index signature, and `DeepMerge`'s `$AV extends PlainObject` test
 * fails without one, silently degrading `registry.extend` from merging into a
 * node to replacing it wholesale. `test/Mergeable.test.ts` is the guard.
 *
 * `use` is not a faker module name — `test/index.types.test.ts` asserts it
 * never becomes one, since it shares a key space with {@link ModuleName}.
 */
export type FakerExtension = FakerModules & {
  /**
   * Escape hatch — a plain-object namespace, not a callable, for the
   * `deepMerge` reason above: every form is named, including the untyped one.
   * Each hands the shared, stream-backed `Faker` to a callback, so the call
   * keeps its own inference and still draws from the leaf's seeded stream — the
   * callback runs inside the same producer every ordinary builder runs inside
   * (`src/index.ts`'s `draw`).
   *
   * How `helpers` is reached (omitted from the mirror — deviation policy in
   * `CLAUDE.md`'s "The faker extension"). Kind-tagged forms (`.string`,
   * `.number`, `.date`, `.boolean`, `.bigint`) keep adapter compatibility
   * available there too. `.opaque` is the **only** way to get an `opaque`
   * schema out of this package — honest, since it is the one place the caller
   * has told us nothing about the shape.
   */
  readonly use: {
    readonly string: (
      produce: (faker: Faker) => string,
    ) => Primitive.string.Schema;
    readonly number: (
      produce: (faker: Faker) => number,
    ) => Primitive.number.Schema;
    readonly date: (produce: (faker: Faker) => Date) => Primitive.date.Schema;
    readonly boolean: (
      produce: (faker: Faker) => boolean,
    ) => Primitive.boolean.Schema;
    readonly bigint: (
      produce: (faker: Faker) => bigint,
    ) => Primitive.bigint.Schema;
    readonly opaque: <$T>(
      produce: (faker: Faker) => $T,
    ) => Primitive.opaque.Schema<$T>;
  };
};
