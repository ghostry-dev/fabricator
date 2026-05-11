import { initialize, registry } from "@ghostry/fabricator";
import {
  Children,
  Kind,
  type Fabrication,
  type NaiveFabricator,
  type Primitive,
  type ValueOf,
} from "@ghostry/fabricator/internal";
import { expect, test } from "bun:test";

/**
 * Compile-time assertions. `Expect<Equal<A, B>>` fails to typecheck unless
 * `A` and `B` are the exact same type, so a wrong `Fabrication<...>`
 * resolution (e.g. an unexpected `never`) surfaces as a `tsc` error rather
 * than passing silently. `Extends` is the one-directional variant, paired
 * up below where a type carries an irrelevant `& {}` (from `Pretty`) that
 * the strict `Equal` would reject.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Extends<A, B> = A extends B ? true : false;
type Expect<_ extends true> = true;

const { T, Fabricator } = initialize({ types: registry });

/* -------------------------------------------------------------------------- */
/*  One representative Fabricator per primitive. Every `T.<primitive>` access */
/*  (bare, `.whereby(...)`, a factory call) yields a Schema, never something   */
/*  with `.fabricate()` — that only exists once `build()` is called on it.    */
/* -------------------------------------------------------------------------- */

const always = new Fabricator(T.always("hello"));
const array = new Fabricator(
  T.array(T.always("x")).whereby({ length: { max: 2 } }),
);
const tuple = new Fabricator(T.tuple([T.always("x"), T.number]));
/**
 * All four key shapes a `record` can take. The split its `Fabricated` makes
 * is *open keyspace vs. finite one*, not string vs. symbol — so the mixed
 * `string | symbol` case has to keep both halves, and only the finite case
 * becomes `Partial` (collisions mean a literal key set may not be covered).
 */
/**
 * `opaque` infers straight from its producer's return type, so the value type
 * is as precise as anything hand-written — the whole point of it over the
 * `T.enum.uniform([dummy]).as(...)` trick it replaces.
 */
const opaque = new Fabricator(T.opaque(() => new Map<string, number>()));
const opaqueUsingStream = new Fabricator(
  T.opaque(({ random }) => random.next()),
);
/**
 * `recursive` infers its self-referential value type with no annotation —
 * `test/Recursive.types.test.ts` covers this in depth; this is just the one
 * representative entry every other kind gets here.
 */
const recursiveTree = new Fabricator(
  T.recursive((self) =>
    T.object({
      value: T.number.integer.whereby({ min: 0, max: 9 }),
      children: T.array(self).whereby({ length: { max: 2 } }),
    }),
  ).whereby({ depth: { max: 2 } }),
);
const stringRecord = new Fabricator(
  T.record(T.string.whereby({ length: { max: 4 } }), T.always(1)).whereby({
    size: { max: 2 },
  }),
);
const symbolRecord = new Fabricator(
  T.record(T.symbol, T.always(1)).whereby({ size: { max: 2 } }),
);
const mixedKeyRecord = new Fabricator(
  T.record(
    T.choice.uniform([T.string.whereby({ length: { max: 4 } }), T.symbol]),
    T.always(1),
  ).whereby({ size: { max: 2 } }),
);
const literalKeyRecord = new Fabricator(
  T.record(T.enum.uniform(["a", "b"]), T.always(1)).whereby({
    size: { max: 2 },
  }),
);
const bigint = new Fabricator(T.bigint.whereby({ max: BigInt(32) }));
const boolean = new Fabricator(T.boolean);
const choice = new Fabricator(T.choice.uniform([T.always("x"), T.always(1)]));
const date = new Fabricator(T.date);
const enumFabricator = new Fabricator(T.enum.uniform(["a", "b", "c"]));
const number = new Fabricator(T.number);
const object = new Fabricator(T.object({ a: T.always(1) }));
const omittableObject = new Fabricator(
  T.object({ a: T.omittable(T.always("x")), b: T.always(1) }),
);
const optionalObject = new Fabricator(
  T.object({ a: T.optional(T.always("x")), b: T.always(1) }),
);
const string = new Fabricator(T.string.whereby({ length: { max: 25 } }));
const symbol = new Fabricator(T.symbol);
const undef = new Fabricator(T.undefined);
const undefinable = new Fabricator(T.undefinable(T.always("x")));
const nul = new Fabricator(T.null);
const nullable = new Fabricator(T.nullable(T.always("x")));
const nullish = new Fabricator(T.nullish(T.always("x")));

/**
 * A refined object's Schema, asserted here pre-`build()` via `ValueOf` (a
 * computed field's type is readable straight off the Schema without
 * building it). See the `test("a .refine()-computed field builds and
 * fabricates ...")` block below for the built/fabricated runtime behavior.
 */
const refinedSchema = T.object({ id: T.always(1) }).refine(({ compute }) => ({
  refined: compute(T.date).as(({ fabricated }) => new Date(fabricated.id)),
}));

/* -------------------------------------------------------------------------- */
/*  Each primitive's Fabrication must resolve to its fabricated value type.    */
/*  Exported as a tuple so `noUnusedLocals` sees them as used.                 */
/* -------------------------------------------------------------------------- */

export type Assertions = [
  Expect<Equal<Fabrication<typeof always>, "hello">>,
  Expect<Extends<Fabrication<typeof array>, "x"[]>>,
  Expect<Equal<Fabrication<typeof tuple>, ["x", number]>>,
  // An open keyspace stays a plain index signature — no `Partial`, since an
  // index signature never guarantees a key is present anyway.
  Expect<Equal<Fabrication<typeof opaque>, Map<string, number>>>,
  Expect<Equal<Fabrication<typeof opaqueUsingStream>, number>>,
  Expect<
    Equal<
      Fabrication<typeof recursiveTree>["children"][number]["value"],
      number
    >
  >,
  Expect<Equal<Fabrication<typeof stringRecord>, Record<string, 1>>>,
  Expect<Equal<Fabrication<typeof symbolRecord>, Record<symbol, 1>>>,
  // The mixed case must keep *both* halves. Asserting the negative too,
  // because the failure mode here is a silent collapse to `Record<string, 1>`
  // (what hardcoding `string` in the open branch would have produced).
  Expect<Equal<Fabrication<typeof mixedKeyRecord>, Record<string | symbol, 1>>>,
  Expect<
    Equal<Equal<Fabrication<typeof mixedKeyRecord>, Record<string, 1>>, false>
  >,
  // A finite key set becomes `Partial`: the size is drawn and colliding keys
  // collapse, so neither member is guaranteed to appear.
  Expect<Equal<Fabrication<typeof literalKeyRecord>, { a?: 1; b?: 1 }>>,
  Expect<Equal<Fabrication<typeof bigint>, bigint>>,
  Expect<Equal<Fabrication<typeof boolean>, boolean>>,
  Expect<Equal<Fabrication<typeof choice>, "x" | 1>>,
  Expect<Equal<Fabrication<typeof date>, Date>>,
  Expect<Equal<Fabrication<typeof enumFabricator>, "a" | "b" | "c">>,
  Expect<Equal<Fabrication<typeof number>, number>>,
  // `Pretty` intersects `& {}`, so compare by mutual assignability.
  Expect<Extends<Fabrication<typeof object>, { a: 1 }>>,
  Expect<Extends<{ a: 1 }, Fabrication<typeof object>>>,
  // `T.omittable`'s wrapped key must be a real `?:`, not `a: "x" | undefined`.
  Expect<Extends<Fabrication<typeof omittableObject>, { a?: "x"; b: 1 }>>,
  Expect<Extends<{ a?: "x"; b: 1 }, Fabrication<typeof omittableObject>>>,
  // `T.optional` combines both: a real `?:` *and* `| undefined`.
  Expect<
    Extends<Fabrication<typeof optionalObject>, { a?: "x" | undefined; b: 1 }>
  >,
  Expect<
    Extends<{ a?: "x" | undefined; b: 1 }, Fabrication<typeof optionalObject>>
  >,
  Expect<Equal<Fabrication<typeof string>, string>>,
  Expect<Equal<Fabrication<typeof symbol>, symbol>>,
  Expect<Equal<Fabrication<typeof undef>, undefined>>,
  Expect<Equal<Fabrication<typeof undefinable>, "x" | undefined>>,
  Expect<Equal<Fabrication<typeof nul>, null>>,
  Expect<Equal<Fabrication<typeof nullable>, "x" | null>>,
  Expect<Equal<Fabrication<typeof nullish>, "x" | null | undefined>>,
  // A computed key resolves to its source's type, not `unknown`.
  Expect<Extends<ValueOf<typeof refinedSchema>, { id: 1; refined: Date }>>,
  Expect<Extends<{ id: 1; refined: Date }, ValueOf<typeof refinedSchema>>>,
];

/* -------------------------------------------------------------------------- */
/*  object/array/tuple/always additionally expose their own, kind-local       */
/*  `Fabrication<$Fabricator>` (distinct from the shared one above) — kept    */
/*  around as forward-looking public type-helpers even though nothing in     */
/*  the library consumes them yet, so they're asserted here directly.        */
/* -------------------------------------------------------------------------- */

export type LocalFabricationAssertions = [
  Expect<Equal<Primitive.always.Fabrication<typeof always>, "hello">>,
  Expect<Extends<Primitive.array.Fabrication<typeof array>, "x"[]>>,
  Expect<Equal<Primitive.tuple.Fabrication<typeof tuple>, ["x", number]>>,
  Expect<Extends<Primitive.object.Fabrication<typeof object>, { a: 1 }>>,
  Expect<Extends<{ a: 1 }, Primitive.object.Fabrication<typeof object>>>,
];

/**
 * Regression guard: a concretely-parameterized `Primitive.object.Fabricator<$Schema>`
 * (e.g. `typeof object` above) must still structurally satisfy the bare,
 * unparameterized `Primitive.object.Fabricator` — the same `$Fabricator extends
 * Fabricator` constraint every kind-local `Fabrication` helper relies on.
 * `Schema.refine`/`.extend`/`.from` all use `$Definition` contravariantly, so
 * adding a field whose type depends on `$Definition` (like `.schema` or
 * `.from`) risks silently breaking this — see `object/Core.ts`'s
 * `Fabricator` doc comment for the `{ [Meta]: Meta<any> }` default that
 * keeps it working.
 */
export type FromDoesNotBreakBareFabricatorAssertions = [
  Expect<Extends<typeof object, Primitive.object.Fabricator>>,
];

/* -------------------------------------------------------------------------- */
/*  The core invariant this architecture rests on: a Schema — bare, or fully  */
/*  configured via `.whereby(...)` — never has `.fabricate()` until it is     */
/*  explicitly passed to `build()`. `object`/`array`/`.extend()`/`.refine()`  */
/*  never produce one either, only ever more Schema.                         */
/* -------------------------------------------------------------------------- */

export type BareNamespaceIsNotYetBuilt = Expect<
  Equal<typeof T.bigint extends NaiveFabricator<any> ? true : false, false>
>;

export type ConfiguredSchemaIsNotYetBuilt = Expect<
  Equal<
    ReturnType<typeof T.bigint.whereby> extends NaiveFabricator<any>
      ? true
      : false,
    false
  >
>;

test("primitive Fabrication resolutions typecheck", () => {
  // The assertions above are compile-time; this keeps the suite non-empty
  // and sanity-checks that a resolved fabricator actually produces a value.
  expect(typeof bigint.fabricate()).toBe("bigint");
  expect(["x", 1]).toContain(choice.fabricate());
  expect(["a", "b", "c"]).toContain(enumFabricator.fabricate());
  expect(undef.fabricate()).toBeUndefined();
  expect([undefined, "x"]).toContain(undefinable.fabricate());
  expect(nul.fabricate()).toBeNull();
  expect([null, "x"]).toContain(nullable.fabricate());
  expect([null, undefined, "x"]).toContain(nullish.fabricate());
});

test("a .refine()-computed field builds and fabricates against its siblings", () => {
  const built = new Fabricator(refinedSchema);
  const fabricated = built.fabricate();

  expect(fabricated.id).toBe(1);
  expect(fabricated.refined).toBeInstanceOf(Date);
  expect(fabricated.refined.getTime()).toBe(new Date(fabricated.id).getTime());
});

test("every composite kind's built Fabricator carries [Children]; recursive's carries none", () => {
  expect(array[Children]).toBeDefined();
  expect(tuple[Children]).toHaveLength(2);
  expect(choice[Children]).toHaveLength(2);
  expect(object[Children]).toBeDefined();
  expect(stringRecord[Children]).toHaveProperty("key");
  expect(stringRecord[Children]).toHaveProperty("value");
  expect(nullable[Children]).toBeDefined();
  expect(nullish[Children]).toBeDefined();
  expect(undefinable[Children]).toBeDefined();

  const omittableField = (omittableObject as any)[Children].a;
  expect(omittableField[Kind]).toBe("object.omittable");
  expect(omittableField[Children]).toBeDefined();

  const optionalField = (optionalObject as any)[Children].a;
  expect(optionalField[Kind]).toBe("object.optional");
  expect(optionalField[Children]).toBeDefined();

  // `recursive` dispatches lazily during `fabricate()`, so it has no
  // build-time children to expose.
  expect((recursiveTree as any)[Children]).toBeUndefined();
});

test("a compute source with no buildable recipe (e.g. bare T.string) still builds, since its value never comes from the source", () => {
  const schema = T.object({ id: T.always(1) }).refine(({ compute }) => ({
    sku: compute(T.string).as(({ fabricated }) => `SKU-${fabricated.id}`),
  }));

  const fabricated = new Fabricator(schema).fabricate();

  expect(fabricated.sku).toBe("SKU-1");
});
