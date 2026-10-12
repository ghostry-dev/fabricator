import {
  initialize,
  registry,
  satisfies,
  type SatisfiedBy,
  type ValueOf,
} from "@ghostry/fabricator";
import type {
  Kind,
  Meta,
  Produced,
  Produces,
} from "@ghostry/fabricator/internal";

/**
 * Compile-time assertions — see `Fabrication.types.test.ts` for why `Equal`/
 * `Expect` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;

const { T } = initialize({ types: registry });

/* -------------------------------------------------------------------------- */
/*  A schema's value type is read off an optional brand, `[Produces]?`, and   */
/*  reading an optional property adds `| undefined`. Every assertion here     */
/*  holds under both settings of the reader's `exactOptionalPropertyTypes`:   */
/*  this file is compiled by `tsconfig.json` (on) and by                      */
/*  `tsconfig.inexact.json` (off), and the second is what gives it teeth.     */
/*  With the flag off there is no telling the modifier's `undefined` from     */
/*  one the value type holds, unless the brand boxes the value type           */
/*  (`Produced<…>`, `src/Types.ts`) so the two never share a union. Unboxed,  */
/*  and compiled with the flag off, `ValueOf<typeof T.undefined>` is `never`  */
/*  and every `undefinable` below loses its `undefined`.                      */
/* -------------------------------------------------------------------------- */

const text = T.string.whereby({ length: { max: 4 } });
const row = T.object({ id: text });

const nothing = T.undefined;
const undefinable = T.undefinable(text);
const nullable = T.nullable(text);
const nullish = T.nullish(text);
const optional = T.optional(text);
const omittable = T.omittable(text);

export type WrapperAssertions = [
  Expect<Equal<ValueOf<typeof nothing>, undefined>>,
  Expect<Equal<ValueOf<typeof undefinable>, string | undefined>>,
  Expect<Equal<ValueOf<typeof nullable>, string | null>>,
  Expect<Equal<ValueOf<typeof nullish>, string | null | undefined>>,
  Expect<Equal<ValueOf<typeof optional>, string | undefined>>,
  Expect<Equal<ValueOf<typeof omittable>, string>>,
];

/* -------------------------------------------------------------------------- */
/*  Every other kind whose value type can hold an `undefined` of its own.     */
/* -------------------------------------------------------------------------- */

const alwaysUndefined = T.always(undefined);
const enumerated = T.enum.uniform(["a", undefined]);
const chosen = T.choice.uniform([text, T.undefined]);
const opaque = T.opaque((): Map<string, number> | undefined => undefined);
const derived = T.derive({ to: undefinable, from: [T.boolean] }).as(
  ([present]) => (present ? "x" : undefined),
);
const computed = T.object({ flag: T.boolean }).refine(({ compute }) => ({
  label: compute(undefinable).as(({ fabricated }) =>
    fabricated.flag ? "x" : undefined,
  ),
}));

export type OwnUndefinedAssertions = [
  Expect<Equal<ValueOf<typeof alwaysUndefined>, undefined>>,
  Expect<Equal<ValueOf<typeof enumerated>, "a" | undefined>>,
  Expect<Equal<ValueOf<typeof chosen>, string | undefined>>,
  Expect<Equal<ValueOf<typeof opaque>, Map<string, number> | undefined>>,
  Expect<Equal<ValueOf<typeof derived>, string | undefined>>,
  Expect<Equal<ValueOf<typeof computed>["label"], string | undefined>>,
];

/* -------------------------------------------------------------------------- */
/*  Nested: each composite reads its children through the same brand, so a    */
/*  child's `undefined` has to survive that read too.                         */
/* -------------------------------------------------------------------------- */

const inObject = T.object({
  nothing,
  undefinable,
  nullable,
  nullish,
  optional,
  omittable,
});
const inArray = {
  nothing: T.array(nothing).whereby({ length: { max: 2 } }),
  undefinable: T.array(undefinable).whereby({ length: { max: 2 } }),
  nullable: T.array(nullable).whereby({ length: { max: 2 } }),
  nullish: T.array(nullish).whereby({ length: { max: 2 } }),
};
const inTuple = T.tuple([nothing, undefinable, nullable, nullish]);
const inRecord = {
  nothing: T.record(text, nothing).whereby({ size: { max: 2 } }),
  undefinable: T.record(text, undefinable).whereby({ size: { max: 2 } }),
  nullable: T.record(text, nullable).whereby({ size: { max: 2 } }),
  nullish: T.record(text, nullish).whereby({ size: { max: 2 } }),
};

/** A wrapper around a composite, and wrappers around wrappers. */
const maybeRow = T.undefinable(row);
const rowWithNullable = T.object({ user: T.nullable(text) });
const stacked = T.nullable(T.undefinable(text));
const deep = T.array(
  T.object({ pair: T.tuple([T.undefinable(row), T.nullish(row)]) }),
).whereby({ length: { max: 2 } });

export type NestedAssertions = [
  /**
   * A required key whose value may be `undefined` stays a required key —
   * `Equal` tells `{ k: V | undefined }` from `{ k?: V }` under either flag.
   */
  Expect<
    Equal<
      ValueOf<typeof inObject>,
      {
        nothing: undefined;
        undefinable: string | undefined;
        nullable: string | null;
        nullish: string | null | undefined;
        optional?: string | undefined;
        omittable?: string;
      }
    >
  >,

  Expect<Equal<ValueOf<typeof inArray.nothing>, undefined[]>>,
  Expect<Equal<ValueOf<typeof inArray.undefinable>, (string | undefined)[]>>,
  Expect<Equal<ValueOf<typeof inArray.nullable>, (string | null)[]>>,
  Expect<Equal<ValueOf<typeof inArray.nullish>, (string | null | undefined)[]>>,

  Expect<
    Equal<
      ValueOf<typeof inTuple>,
      [undefined, string | undefined, string | null, string | null | undefined]
    >
  >,

  Expect<Equal<ValueOf<typeof inRecord.nothing>, Record<string, undefined>>>,
  Expect<
    Equal<
      ValueOf<typeof inRecord.undefinable>,
      Record<string, string | undefined>
    >
  >,
  Expect<
    Equal<ValueOf<typeof inRecord.nullable>, Record<string, string | null>>
  >,
  Expect<
    Equal<
      ValueOf<typeof inRecord.nullish>,
      Record<string, string | null | undefined>
    >
  >,

  Expect<Equal<ValueOf<typeof maybeRow>, { id: string } | undefined>>,
  Expect<Equal<ValueOf<typeof rowWithNullable>, { user: string | null }>>,
  Expect<Equal<ValueOf<typeof stacked>, string | null | undefined>>,
  Expect<
    Equal<
      ValueOf<typeof deep>,
      {
        pair: [{ id: string } | undefined, { id: string } | null | undefined];
      }[]
    >
  >,
];

/* -------------------------------------------------------------------------- */
/*  Recursive: `self` resolves through the brand as well (`bindings[0]`), so  */
/*  a wrapper around it keeps its own `undefined` beside the fixed point.     */
/* -------------------------------------------------------------------------- */

const tree = T.recursive((self) =>
  T.object({
    value: T.undefinable(T.number),
    parent: T.undefinable(self),
    next: T.nullish(self),
    previous: T.nullable(self),
    children: T.array(self).whereby({ length: { max: 2 } }),
    slots: T.tuple([T.undefinable(self), T.undefined]),
  }),
).whereby({ depth: { max: 2 } });

type Tree = ValueOf<typeof tree>;

export type RecursiveAssertions = [
  Expect<Equal<Equal<Tree, unknown>, false>>,
  Expect<Equal<Equal<Tree, any>, false>>,
  Expect<Equal<Tree["value"], number | undefined>>,
  Expect<Equal<Tree["parent"], Tree | undefined>>,
  Expect<Equal<Tree["next"], Tree | null | undefined>>,
  Expect<Equal<Tree["previous"], Tree | null>>,
  Expect<Equal<Tree["children"], Tree[]>>,
  Expect<Equal<Tree["slots"], [Tree | undefined, undefined]>>,
  /** Still exact a few hops down, not just at the first. */
  Expect<
    Equal<
      NonNullable<Tree["children"][number]["parent"]>["next"],
      Tree | null | undefined
    >
  >,
];

/* -------------------------------------------------------------------------- */
/*  Everything that matches or infers through the brand, rather than going    */
/*  through `ValueOf`, has to name the box for the same reason. Unboxed and   */
/*  with the flag off, each rejection below is silently accepted: a schema    */
/*  that may produce `undefined` reads as one that never does.                */
/* -------------------------------------------------------------------------- */

satisfies<string | undefined>(undefinable);
satisfies<{ id: string } | undefined>(maybeRow);
// @ts-expect-error — may produce undefined, which is not a string
satisfies<string>(undefinable);
// @ts-expect-error — may produce undefined, which is not a row
satisfies<{ id: string }>(maybeRow);
// @ts-expect-error — T.undefined produces undefined, not a string
satisfies<string>(nothing);

export type SatisfiedByAssertions = [
  Expect<SatisfiedBy<string | undefined, typeof undefinable>>,
  Expect<
    // @ts-expect-error — may produce undefined, which is not a string
    SatisfiedBy<string, typeof undefinable>
  >,
];

/** `record.Key`: a key that may be `undefined` is not a property key. */
// @ts-expect-error — the key schema may produce undefined
const undefinedKeyed = T.record(undefinable, text);

/** `recursive`'s `terminal`: must produce the body's own value type. */
const terminated = T.recursive((self) =>
  T.object({ next: T.nullable(self) }),
).whereby({ depth: { max: 1 }, terminal: T.object({ next: T.null }) });
const misterminated = T.recursive(
  (self) => T.object({ next: T.nullable(self) }),
  // @ts-expect-error — the terminal produces undefined, not the body's object
).whereby({ depth: { max: 1 }, terminal: T.undefined });

/**
 * The shape a downstream reader takes — `@ghostry/extern-extension-fabricator-
 * v0`'s `Schema<$T>` is one — inferring `$T` back out of the brand, as a
 * conditional type and at a call site. Both have to recover the value type's
 * own `undefined`.
 */
type Branded<$T> = {
  readonly [Kind]: unknown;
  readonly [Meta]: unknown;
  readonly [Produces]?: Produced<$T>;
};
type Inferred<$Schema> = $Schema extends Branded<infer $T> ? $T : never;

function produced<$T>(schema: Branded<$T>): $T {
  void schema;

  return undefined as $T;
}

const inferredRow = produced(maybeRow);
const inferredNothing = produced(nothing);
const inferredNullish = produced(nullish);

export type InferenceAssertions = [
  Expect<Equal<Inferred<typeof maybeRow>, { id: string } | undefined>>,
  Expect<Equal<Inferred<typeof nothing>, undefined>>,
  Expect<Equal<Inferred<typeof nullish>, string | null | undefined>>,
  Expect<Equal<Inferred<typeof tree>, Tree>>,

  Expect<Equal<typeof inferredRow, { id: string } | undefined>>,
  Expect<Equal<typeof inferredNothing, undefined>>,
  Expect<Equal<typeof inferredNullish, string | null | undefined>>,
];

/**
 * Keep the rejected fixtures referenced so `noUnusedLocals` does not treat a
 * missing `@ts-expect-error` as an unused binding.
 */
export const fixtures = { undefinedKeyed, terminated, misterminated };
