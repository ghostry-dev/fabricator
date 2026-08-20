import { initialize, registry } from "@ghostry/fabricator";
import {
  toTypeBox,
  type ToTypeBox,
} from "@ghostry/fabricator-adapter-typebox-v0";
import type { Primitive } from "@ghostry/fabricator/internal";
import {
  type TArray,
  type TBigInt,
  type TDate,
  type TInteger,
  type TLiteral,
  type TNever,
  type TNull,
  type TNumber,
  type TObject,
  type TOptional,
  type TReadonly,
  type TRecord,
  type TRecursive,
  type TSchema,
  type TString,
  type TThis,
  type TTuple,
  type TUndefined,
  type TUnion,
  type TUnknown,
} from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { expect, test } from "bun:test";

/**
 * Compile-time assertions — see `Fabrication.types.test.ts` for why `Equal`/
 * `Expect` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;

const { T, Fabricator } = initialize({ types: registry });

/* -------------------------------------------------------------------------- */
/*  `toTypeBox()` on a pre-build Schema was already precisely typed. The bug  */
/*  these assertions guard against: calling it on a *built* Fabricator of the */
/*  same Schema used to silently fall back to the generic `TSchema` —        */
/*  `toTypeBox` still ran fine at runtime either way, so only a compile-time  */
/*  assertion like this one can actually catch a regression.                 */
/* -------------------------------------------------------------------------- */

const intSeq = toTypeBox(new Fabricator(T.number.integer.sequence));
const bareNumber = toTypeBox(new Fabricator(T.number));
const obj = toTypeBox(
  new Fabricator(
    T.object({
      x: T.number.integer,
      y: T.string.whereby({ length: { max: 5 } }),
    }),
  ),
);
const nested = toTypeBox(
  new Fabricator(T.object({ inner: T.object({ flag: T.always(true) }) })),
);
const withOmittable = toTypeBox(
  new Fabricator(T.object({ x: T.omittable(T.number.integer) })),
);
const withUndefinable = toTypeBox(
  new Fabricator(T.object({ x: T.undefinable(T.number.integer) })),
);
const withOptional = toTypeBox(
  new Fabricator(T.object({ x: T.optional(T.number.integer) })),
);
const withNullable = toTypeBox(
  new Fabricator(T.object({ x: T.nullable(T.number.integer) })),
);
const withNullish = toTypeBox(
  new Fabricator(T.object({ x: T.nullish(T.number.integer) })),
);
const withEnum = toTypeBox(
  new Fabricator(T.object({ x: T.enum.uniform(["a", "b", "c"]) })),
);
const withSingleMemberEnum = toTypeBox(
  new Fabricator(T.object({ x: T.enum.uniform(["a"]) })),
);
const withChoice = toTypeBox(
  new Fabricator(
    T.object({
      x: T.choice.uniform([
        T.number.integer,
        T.string.whereby({ length: { max: 5 } }),
      ]),
    }),
  ),
);
const withSingleOptionChoice = toTypeBox(
  new Fabricator(T.object({ x: T.choice.uniform([T.number.integer]) })),
);
const withOpaque = toTypeBox(
  new Fabricator(T.opaque(() => new Map<string, number>())),
);
const withRecord = toTypeBox(
  new Fabricator(
    T.record(
      T.string.whereby({ length: { max: 4 } }),
      T.number.integer,
    ).whereby({ size: { max: 3 } }),
  ),
);
const withLiteralKeyRecord = toTypeBox(
  new Fabricator(
    T.record(T.enum.uniform(["a", "b"]), T.number.integer).whereby({
      size: { max: 2 },
    }),
  ),
);
const withRecursive = toTypeBox(
  new Fabricator(
    T.object({
      x: T.recursive((s) =>
        T.object({
          value: T.number.integer,
          children: T.array(s).whereby({ length: { max: 2 } }),
        }),
      ).whereby({ depth: { max: 2 } }),
    }),
  ),
);
const withTuple = toTypeBox(
  new Fabricator(
    T.object({
      x: T.tuple([T.number.integer, T.string.whereby({ length: { max: 5 } })]),
    }),
  ),
);

/**
 * `always` and `object.compute` are the two kinds whose Schema shape used to be
 * declared inline in their `Schema.ts`, with no `Core` for the adapters to
 * match — so `ToTypeBox` matched their `Schema` types, which silently made
 * every builder method part of the match. Adding `.adapt(...)` to those
 * interfaces was enough to stop a _built_ Fabricator (which has no builder
 * methods) from matching at all, dropping it to the generic `TSchema` fallback
 * with `tsc` still green, because nothing asserted these two shapes post-build.
 * Both kinds now have a real `Core`, and these are the assertions that would
 * have caught it.
 */
const builtAlways = toTypeBox(new Fabricator(T.always("x")));
const builtComputed = toTypeBox(
  new Fabricator(
    T.object({ id: T.always(1) }).refine(({ compute }) => ({
      label: compute(T.string).as(() => "computed"),
    })),
  ),
);

/**
 * `always` is no longer capped at `string | number | boolean` (that cap was
 * TypeBox's `TLiteralValue` leaking into the primitive), so these are the
 * values it could not previously hold. Each maps through `ToTypeBox`'s
 * `ToConst`, which is `TConst` plus a guard — see the bare-vs-concrete
 * assertion below for what that guard is for.
 */
const alwaysNull = toTypeBox(new Fabricator(T.always(null)));
const alwaysBigInt = toTypeBox(new Fabricator(T.always(BigInt(5))));
const alwaysDate = toTypeBox(new Fabricator(T.always(new Date(0))));
const alwaysObject = toTypeBox(new Fabricator(T.always({ a: 1 })));

/**
 * `readonly` on every key: `T.object`'s definition parameter is a `const` type
 * parameter, so `toTypeBox` already reflects that on an _unbuilt_ Schema too —
 * nothing to do with `construct()`, unaffected by this fix.
 */
export type Assertions = [
  Expect<Equal<typeof intSeq, TInteger>>,
  Expect<Equal<typeof bareNumber, TNumber>>,
  Expect<
    Equal<typeof obj, TObject<{ readonly x: TInteger; readonly y: TString }>>
  >,
  Expect<
    Equal<
      typeof nested,
      TObject<{ readonly inner: TObject<{ readonly flag: TLiteral<true> }> }>
    >
  >,
  Expect<
    Equal<typeof withOmittable, TObject<{ readonly x: TOptional<TInteger> }>>
  >,
  Expect<
    Equal<
      typeof withUndefinable,
      TObject<{ readonly x: TUnion<[TInteger, TUndefined]> }>
    >
  >,
  Expect<
    Equal<
      typeof withOptional,
      TObject<{ readonly x: TOptional<TUnion<[TInteger, TUndefined]>> }>
    >
  >,
  Expect<
    Equal<
      typeof withNullable,
      TObject<{ readonly x: TUnion<[TInteger, TNull]> }>
    >
  >,
  Expect<
    Equal<
      typeof withNullish,
      TObject<{ readonly x: TUnion<[TInteger, TNull, TUndefined]> }>
    >
  >,
  // `enum` preserves arity as a real tuple (`EnumOptions` in `ToTypeBox`, the
  // same head/tail recursion `ChoiceOptions` uses below), so 3 members map to
  // a proper 3-slot `TUnion<[...]>` — exactly what the runtime emits, rather
  // than the arity-less `TLiteral<"a"> | TLiteral<"b"> | TLiteral<"c">` this
  // approximated with while `enum.Meta.items` was a plain `ReadonlyArray`.
  // Each member is a *value*, so it maps through `ToConst` (not `ToTypeBox`,
  // which is what a `choice`'s option Schemas get).
  Expect<
    Equal<
      typeof withEnum,
      TObject<{
        readonly x: TUnion<[TLiteral<"a">, TLiteral<"b">, TLiteral<"c">]>;
      }>
    >
  >,
  // A single member collapses with no `TUnion` wrapper at all, matching
  // TypeBox's own `Union<T>`/`Type.Union` behavior exactly — the one case the
  // old arity-less form already got right, and the reason mirroring
  // `Union<T>` rather than always wrapping is what makes this exact.
  Expect<
    Equal<typeof withSingleMemberEnum, TObject<{ readonly x: TLiteral<"a"> }>>
  >,
  // `choice` preserves arity as a real tuple (`ChoiceOptions` in
  // `ToTypeBox`), so 2 options map to a proper 2-slot `TUnion<[...]>` —
  // matching what `Type.Union` actually returns at runtime for 2+ options
  // (see `ToTypeBox`'s `choice.Core` branch, and the single-option case
  // exercised at runtime in the tests below).
  Expect<
    Equal<
      typeof withChoice,
      TObject<{ readonly x: TUnion<[TInteger, TString]> }>
    >
  >,
  // A single option collapses with no `TUnion` wrapper at all, matching
  // TypeBox's own `Union<T>`/`Type.Union` behavior exactly.
  Expect<
    Equal<typeof withSingleOptionChoice, TObject<{ readonly x: TInteger }>>
  >,
  // `tuple` preserves arity as a real tuple (`TupleItems` in `ToTypeBox`, the
  // same head/tail recursion `ChoiceOptions` uses above), so a 2-slot
  // `T.tuple([...])` maps to a proper 2-slot `TTuple<[...]>` — matching what
  // `Type.Tuple` actually returns at runtime (exercised below).
  Expect<
    Equal<
      typeof withTuple,
      TObject<{ readonly x: TTuple<[TInteger, TString]> }>
    >
  >,
  // An opaque value is whatever its producer returns, so there is nothing to
  // constrain — `TUnknown` is the honest mapping rather than a lossy guess.
  // Note this is the one divergence that *widens*: `Static<TUnknown>` is
  // `unknown` while `Fabrication<...>` of the same schema is the producer's
  // precise return type (asserted in `Fabrication.types.test.ts`).
  Expect<Equal<typeof withOpaque, TUnknown>>,
  // Bare-vs-concrete: `opaque.Core`'s default parameter is already `unknown`,
  // so the bare form maps to `TUnknown` too — unlike `always`, whose bare
  // form needed a guard to avoid degrading into `TObject<{}>`.
  Expect<Equal<ToTypeBox<Primitive.opaque.Core>, TUnknown>>,
  // `record` defers to TypeBox's own `TRecordOrObject`, so it inherits that
  // helper's split: an open string key stays a `TRecord` (emitting
  // `patternProperties`), while a finite literal key set collapses into a
  // `TObject` of exactly those properties.
  Expect<Equal<typeof withRecord, TRecord<TString, TInteger>>>,
  Expect<
    Equal<typeof withLiteralKeyRecord, TObject<{ a: TInteger; b: TInteger }>>
  >,
  // Note the collapsed form marks both properties *required*, while
  // `Fabrication` of the same schema is `Partial` — a record's size is drawn
  // and colliding keys collapse, so it may cover only a subset. That is a
  // deliberate `Static<ToTypeBox<S>>` vs `ValueOf<S>` divergence, not a bug.
  //
  // Bare-vs-concrete: an unconstrained key has no TypeBox counterpart, so
  // this resolves to `TNever` rather than a loose `TSchema` — agreeing with
  // the runtime `convert()`, which throws instead of emitting a silent `TNever`.
  Expect<Equal<ToTypeBox<Primitive.record.Core>, TNever>>,
  // `Type.Recursive((This) => body)` already builds a `$ref`-based schema
  // whose validation naturally recurses however deep an actual value goes,
  // so `terminal` needs no separate mapping — only `body` matters here.
  // Wherever `self` sits nested inside it (through `array`, here), it
  // resolves to `TThis`, the direct analogue of `self.Core` reading
  // `this["bindings"][0]` at the value level.
  Expect<
    Equal<
      typeof withRecursive,
      TObject<{
        readonly x: TRecursive<
          TObject<{
            readonly value: TInteger;
            readonly children: TArray<TThis>;
          }>
        >;
      }>
    >
  >,
  // Bare-vs-concrete: an unparameterized `recursive.Core` defaults `$Body` to
  // `unknown`, which matches none of `ToTypeBox`'s specific branches, so it
  // falls through to the same loose `TSchema` every other unresolved branch
  // uses — wrapped in `TRecursive`, since `recursive.Core` itself still
  // matched. `self.Core` needs no such guard: it isn't parameterized by a
  // value type at all, so it resolves to `TThis` unconditionally.
  Expect<Equal<ToTypeBox<Primitive.recursive.Core>, TRecursive<TSchema>>>,
  Expect<Equal<ToTypeBox<Primitive.recursive.self.Core>, TThis>>,
  Expect<Equal<typeof builtAlways, TLiteral<"x">>>,
  Expect<
    Equal<
      typeof builtComputed,
      TObject<{ readonly id: TLiteral<1>; readonly label: TString }>
    >
  >,

  // The widened `always` values. `bigint`/`Date` resolve to the plain
  // `TBigInt`/`TDate` — TypeBox has no literal form for either, so the
  // *static* type stays wide even though `toConst` pins the value exactly at
  // runtime via `minimum`/`maximum` and `minimum`/`maximumTimestamp`
  // (asserted in `test/Always.test.ts`). That divergence is the point of the
  // note in `CLAUDE.md`.
  Expect<Equal<typeof alwaysNull, TNull>>,
  Expect<Equal<typeof alwaysBigInt, TBigInt>>,
  Expect<Equal<typeof alwaysDate, TDate>>,
  // An object's *values* are wrapped in `TReadonly` while the key modifier
  // itself is stripped (`TFromProperties` maps with `-readonly`) — so the
  // key is mutable here but `Static<>` of it is still `{ readonly a: 1 }`,
  // agreeing with what `T.always(...)`'s `const` type parameter infers for
  // an object literal. `toConst` mirrors this exactly at runtime.
  Expect<Equal<typeof alwaysObject, TObject<{ a: TReadonly<TLiteral<1>> }>>>,

  /**
   * Bare-vs-concrete, the assertion `ToConst`'s `unknown extends $Value` guard
   * exists for. `TConst<unknown>` resolves to `TObject<{}>`, not `TSchema` — so
   * without the guard a bare, unparameterized `always.Core` would claim to be
   * an empty object type instead of falling back to the loose `TSchema` every
   * other unresolved branch uses. This is the same class of trap `tuple`'s
   * `TupleItems` hit (a malformed type that type-checks fine until a
   * bare-vs-concrete comparison is actually written down), so it gets the same
   * guard.
   */
  Expect<Equal<ToTypeBox<Primitive.always.Core>, TSchema>>,
  Expect<Equal<ToTypeBox<Primitive.always.Core<"x">>, TLiteral<"x">>>,

  /**
   * The same bare-vs-concrete pair for `enum`, which `EnumOptions` makes
   * arity-preserving by head/tail recursion rather than a homomorphic `{ [$K in
   * keyof $Items]: ... }` mapped type. The mapped type would type-check right
   * up until exactly this comparison: `keyof` a still- abstract
   * array-constrained `$Items` pulls in `"length"`/method keys too, yielding a
   * malformed bare type (see `ChoiceOptions`' doc comment). Bare, `$Items`
   * matches neither tuple pattern, so it lands on the widened-array fallback
   * and resolves to `TUnion<TSchema[]>` — the same "some union of an unknown
   * number of schemas" shape a bare `choice` gives.
   */
  Expect<Equal<ToTypeBox<Primitive.enum.Core>, TUnion<TSchema[]>>>,
  Expect<
    Equal<
      ToTypeBox<
        Primitive.enum.Core<
          readonly [readonly [number, "a"], readonly [number, "b"]]
        >
      >,
      TUnion<[TLiteral<"a">, TLiteral<"b">]>
    >
  >,
];

test("toTypeBox(build(...)) produces the same runtime schema as toTypeBox(...)", () => {
  expect(intSeq.type).toBe("integer");
  expect(obj.properties.x.type).toBe("integer");
  expect(obj.properties.y.type).toBe("string");
});

test("an omittable field is not in `required`", () => {
  expect(withOmittable.required).toBeUndefined();
});

test("an undefinable field is still in `required`", () => {
  expect(withUndefinable.required).toEqual(["x"]);
});

test("an optional field is not in `required`, and its value type allows undefined", () => {
  expect(withOptional.required).toBeUndefined();
  const options = withOptional.properties.x.anyOf;
  expect(options.map((o: { type: string }) => o.type)).toEqual([
    "integer",
    "undefined",
  ]);
});

test("a nullable field is still in `required`, and its value type allows null", () => {
  expect(withNullable.required).toEqual(["x"]);
  const options = withNullable.properties.x.anyOf;
  expect(options.map((o: { type: string }) => o.type)).toEqual([
    "integer",
    "null",
  ]);
});

test("a nullish field is still in `required`, and its value type allows null and undefined", () => {
  expect(withNullish.required).toEqual(["x"]);
  const options = withNullish.properties.x.anyOf;
  expect(options.map((o: { type: string }) => o.type)).toEqual([
    "integer",
    "null",
    "undefined",
  ]);
});

test("an enum field maps to a TypeBox union of literals", () => {
  expect(withEnum.required).toEqual(["x"]);
  const options = withEnum.properties.x.anyOf;
  expect(options.map((o: { const: unknown }) => o.const)).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("a single-member enum field collapses with no TUnion wrapper", () => {
  expect(withSingleMemberEnum.properties.x.anyOf).toBeUndefined();
  expect(withSingleMemberEnum.properties.x.const).toBe("a");
});

test("a choice field maps to a TypeBox union of its options' own schemas", () => {
  expect(withChoice.required).toEqual(["x"]);
  const options = withChoice.properties.x.anyOf;
  expect(options.map((o: { type: string }) => o.type)).toEqual([
    "integer",
    "string",
  ]);
});

test("a single-option choice field collapses with no TUnion wrapper", () => {
  expect(withSingleOptionChoice.properties.x.anyOf).toBeUndefined();
  expect(withSingleOptionChoice.properties.x.type).toBe("integer");
});

test("a tuple field maps to a TypeBox tuple of its slots' own schemas", () => {
  expect(withTuple.required).toEqual(["x"]);
  const items = withTuple.properties.x.items;
  expect(withTuple.properties.x.type).toBe("array");
  expect(items.map((i: { type: string }) => i.type)).toEqual([
    "integer",
    "string",
  ]);
});

test("a recursive field maps to a $ref-based TypeBox schema", () => {
  const recursiveField: any = withRecursive.properties.x;

  expect(typeof recursiveField.$id).toBe("string");
  expect(recursiveField.type).toBe("object");
  /** `self` resolved to `$ref`, pointing back at the same `$id`. */
  expect(recursiveField.properties.children.items.$ref).toBe(
    recursiveField.$id,
  );
});

test("Value.Check accepts a real fabricated recursive value, at any depth reached, and rejects a wrong shape", () => {
  const { T, Fabricator } = initialize({
    types: registry,
    seed: "tb-recursive",
  });

  const Node = T.recursive((s) =>
    T.object({
      value: T.number.integer.whereby({ min: 0, max: 9 }),
      children: T.array(s).whereby({ length: { max: 2 } }),
    }),
  ).whereby({ depth: { max: 3 } });

  const schema = toTypeBox(Node);
  const built = new Fabricator(Node);

  for (let i = 0; i < 30; i++) {
    expect(Value.Check(schema, built.fabricate())).toBe(true);
  }

  expect(Value.Check(schema, { value: "not a number", children: [] })).toBe(
    false,
  );
});

/**
 * `self` used with no enclosing `Type.Recursive` call — the TypeBox-side
 * counterpart to `Constructor.ts`'s identical guard, exercised in
 * `Recursive.test.ts` for the fabrication path. Independent code paths
 * (`BuildContext` here, `DispatchContext` there), so both need covering.
 */
test("toTypeBox throws if a captured self reference escapes its T.recursive callback", () => {
  const { T } = initialize({ types: registry, seed: "tb-recursive-misuse" });

  let escaped: unknown;
  T.recursive((s) => {
    escaped = s;
    return T.object({ value: T.number });
  }).whereby({ depth: { max: 1 } });

  const misused = T.object({ oops: escaped as never });

  expect(() => toTypeBox(misused)).toThrow(/active `T\.recursive`/);
});
