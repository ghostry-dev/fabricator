import {
  initialize,
  registry,
  satisfies,
  type SatisfiedBy,
  type Fabrication,
} from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * One-directional equality, paired up where `Pretty` adds an irrelevant `& {}`
 * that strict `Equal` would reject — same as `Fabrication.types.test.ts`, as is
 * `Expect`, declared locally rather than exported from the package.
 */
type Extends<A, B> = A extends B ? true : false;
type Expect<_ extends true> = true;

const { T, Fabricator } = initialize({ types: registry });

type Product = { id: string; price: number };
type Order = { id: string; product: Product; quantity: number; note?: string };

const id = T.string.whereby({ length: { min: 8, max: 8 } });
const price = T.number.whereby({ min: 1, max: 500 });
const adapter = { key: "test/dummy" as const, convert: () => "ok" };

const ProductSchema = T.object({ id, price }).satisfies<Product>();
const OrderSchema = T.object({
  id,
  product: ProductSchema,
  quantity: T.number.integer.whereby({ min: 1, max: 9 }),
  note: T.omittable(T.string.whereby({ length: { max: 40 } })),
}).satisfies<Order>();
const Products = new Fabricator(ProductSchema);

/* -------------------------------------------------------------------------- */
/*  Method — one conforming and one non-conforming case per kind. Fixtures    */
/*  are real schemas (`.whereby` / `T.always`), never bare builders.          */
/* -------------------------------------------------------------------------- */

const alwaysOk = T.always("x").satisfies<string>();
const arrayOk = T.array(T.always("x"))
  .whereby({ length: { max: 2 } })
  .satisfies<string[]>();
const bigintOk = T.bigint.whereby({ max: BigInt(10) }).satisfies<bigint>();
const booleanOk = T.boolean.satisfies<boolean>();
const choiceOk = T.choice
  .uniform([T.always("a"), T.always("b")])
  .satisfies<string>();
const dateOk = T.date.satisfies<Date>();
const datePastOk = T.date.past.satisfies<Date>();
const numberIntegerOk = T.number.integer.satisfies<number>();
const deriveOk = T.derive({ to: T.string, from: [T.always("x")] })
  .as(([value]) => value)
  .satisfies<string>();
const enumOk = T.enum.uniform(["a", "b"]).satisfies<string>();
const nullOk = T.null.satisfies<null>();
const nullableOk = T.nullable(T.always("x")).satisfies<string | null>();
const nullishOk = T.nullish(T.always("x")).satisfies<
  string | null | undefined
>();
const numberOk = T.number.satisfies<number>();
const objectOk = ProductSchema;
const omittableOk = T.omittable(
  T.string.whereby({ length: { max: 40 } }),
).satisfies<string>();
const optionalOk = T.optional(
  T.string.whereby({ length: { max: 40 } }),
).satisfies<string | undefined>();
const opaqueOk = T.opaque(() => new Map<string, number>()).satisfies<
  Map<string, number>
>();
const recordOk = T.record(T.string.whereby({ length: { max: 4 } }), T.always(1))
  .whereby({ size: { max: 2 } })
  .satisfies<Record<string, number>>();
interface Tree {
  value: number;
  children: Tree[];
}
const recursiveOk = T.recursive((self) =>
  T.object({
    value: T.number.integer.whereby({ min: 0, max: 9 }),
    children: T.array(self).whereby({ length: { max: 2 } }),
  }),
)
  .whereby({ depth: { max: 2 } })
  .satisfies<Tree>();
const recursiveSelfOk = T.recursive((self) =>
  T.object({ child: T.omittable(self.satisfies<unknown>()) }),
).whereby({ depth: { max: 1 } });
const stringOk = T.string.whereby({ length: { max: 8 } }).satisfies<string>();
const symbolOk = T.symbol.satisfies<symbol>();
const tupleOk = T.tuple([T.always("x"), T.number]).satisfies<
  [string, number]
>();
const undefinableOk = T.undefinable(T.always("x")).satisfies<
  string | undefined
>();
const undefinedOk = T.undefined.satisfies<undefined>();
const computeOk = T.object({ id: T.always("x") }).refine(({ compute }) => ({
  label: compute(T.string)
    .as(({ fabricated }) => fabricated.id)
    .satisfies<string>(),
}));

// @ts-expect-error — produces string, not number
const alwaysBad = T.always("x").satisfies<number>();
// @ts-expect-error — produces string[], not number[]
const arrayBad = T.array(T.always("x"))
  .whereby({ length: { max: 2 } })
  .satisfies<number[]>();
// @ts-expect-error — produces bigint, not string
const bigintBad = T.bigint.whereby({ max: BigInt(10) }).satisfies<string>();
// @ts-expect-error — produces boolean, not string
const booleanBad = T.boolean.satisfies<string>();
// @ts-expect-error — produces "a" | "b", not number
const choiceBad = T.choice
  .uniform([T.always("a"), T.always("b")])
  .satisfies<number>();
// @ts-expect-error — produces Date, not string
const dateBad = T.date.satisfies<string>();
// @ts-expect-error — produces string, not number
const deriveBad = T.derive({ to: T.string, from: [T.always("x")] })
  .as(([value]) => value)
  .satisfies<number>();
// @ts-expect-error — produces "a" | "b", not number
const enumBad = T.enum.uniform(["a", "b"]).satisfies<number>();
// @ts-expect-error — produces null, not undefined
const nullBad = T.null.satisfies<undefined>();
// @ts-expect-error — includes null
const nullableBad = T.nullable(T.always("x")).satisfies<string>();
// @ts-expect-error — includes null | undefined
const nullishBad = T.nullish(T.always("x")).satisfies<string>();
// @ts-expect-error — produces number, not string
const numberBad = T.number.satisfies<string>();
// @ts-expect-error — missing price
const objectBad = T.object({ id }).satisfies<Product>();
// @ts-expect-error — produces string, not number
const omittableBad = T.omittable(
  T.string.whereby({ length: { max: 40 } }),
).satisfies<number>();
// @ts-expect-error — includes undefined
const optionalBad = T.optional(
  T.string.whereby({ length: { max: 40 } }),
).satisfies<string>();
// @ts-expect-error — Map is not Set
const opaqueBad = T.opaque(() => new Map<string, number>()).satisfies<
  Set<string>
>();
// @ts-expect-error — values are numbers, not strings
const recordBad = T.record(
  T.string.whereby({ length: { max: 4 } }),
  T.always(1),
)
  .whereby({ size: { max: 2 } })
  .satisfies<Record<string, string>>();
// @ts-expect-error — value is number, not string
const recursiveBad = T.recursive((self) =>
  T.object({
    value: T.number.integer.whereby({ min: 0, max: 9 }),
    children: T.array(self).whereby({ length: { max: 2 } }),
  }),
)
  .whereby({ depth: { max: 2 } })
  .satisfies<{ value: string; children: never[] }>();
const recursiveSelfBad = T.recursive((self) =>
  T.object({
    // @ts-expect-error — self's Fabricated is unknown outside $Bindings
    child: T.omittable(self.satisfies<string>()),
  }),
).whereby({ depth: { max: 1 } });
// @ts-expect-error — produces string, not number
const stringBad = T.string.whereby({ length: { max: 8 } }).satisfies<number>();
// @ts-expect-error — produces symbol, not string
const symbolBad = T.symbol.satisfies<string>();
// @ts-expect-error — first slot is string, not number
const tupleBad = T.tuple([T.always("x"), T.number]).satisfies<
  [number, number]
>();
// @ts-expect-error — includes undefined
const undefinableBad = T.undefinable(T.always("x")).satisfies<string>();
// @ts-expect-error — produces undefined, not null
const undefinedBad = T.undefined.satisfies<null>();
const computeBad = T.object({ id: T.always("x") }).refine(({ compute }) => ({
  // @ts-expect-error — compute(T.string) produces string, not number
  label: compute(T.string)
    .as(({ fabricated }) => fabricated.id)
    .satisfies<number>(),
}));

/* -------------------------------------------------------------------------- */
/*  Nested: the error lands on the inner `.satisfies`, not the outer object.  */
/* -------------------------------------------------------------------------- */

const nestedConforming = T.object({
  always: T.always("x").satisfies<string>(),
  product: T.object({ id, price }).satisfies<Product>(),
  quantity: T.number.integer.whereby({ min: 1, max: 9 }).satisfies<number>(),
});

const nestedNonconforming = T.object({
  id,
  // @ts-expect-error — missing price; error is on this nested call
  product: T.object({ id }).satisfies<Product>(),
  quantity: T.number.integer.whereby({ min: 1, max: 9 }),
});

/* -------------------------------------------------------------------------- */
/*  Extra fields pass (assignable-to, not exact). Missing / wrong fail.       */
/* -------------------------------------------------------------------------- */

const extraFields = T.object({ id, price, sku: id }).satisfies<Product>();

/* -------------------------------------------------------------------------- */
/*  Chaining after `.satisfies` keeps the precise fabricated type. The        */
/*  earlier target is not carried forward — a later `.extend` that changes a  */
/*  field is not re-checked unless `.satisfies` is called again.              */
/* -------------------------------------------------------------------------- */

const base = T.object({ id, price }).satisfies<Product>();
const repeated = base.satisfies<Product>().satisfies<Product>();
const afterExtend = base.extend(() => ({ sku: id }));
const afterRefine = base.refine(({ compute }) => ({
  label: compute(T.string).as(({ fabricated }) => fabricated.id),
}));
const afterOverride = base.override({ price: 42 });
const afterAs = base.as(() => ({ id: "x", price: 1 }));
const afterAdapt = base.adapt(adapter, () => "ok");
const afterExtendChecked = afterExtend.satisfies<Product & { sku: string }>();
/** Compiles: the earlier `.satisfies<Product>()` does not re-fire. */
const drifted = base.extend(() => ({ price: id }));
// @ts-expect-error — re-checking the new shape catches the string `price`
const driftedRechecked = drifted.satisfies<Product>();

const afterExtendBuilt = new Fabricator(afterExtend);
const afterRefineBuilt = new Fabricator(afterRefine);
const afterOverrideBuilt = new Fabricator(afterOverride);
const afterAsBuilt = new Fabricator(afterAs);
const afterAdaptBuilt = new Fabricator(afterAdapt);
const afterExtendCheckedBuilt = new Fabricator(afterExtendChecked);

export type ObjectChainingAssertions = [
  Expect<
    Extends<
      Fabrication<typeof afterExtendBuilt>,
      { id: string; price: number; sku: string }
    >
  >,
  Expect<
    Extends<
      { id: string; price: number; sku: string },
      Fabrication<typeof afterExtendBuilt>
    >
  >,
  Expect<
    Extends<
      Fabrication<typeof afterRefineBuilt>,
      { id: string; price: number; label: string }
    >
  >,
  Expect<
    Extends<
      { id: string; price: number; label: string },
      Fabrication<typeof afterRefineBuilt>
    >
  >,
  Expect<Extends<Fabrication<typeof afterOverrideBuilt>, Product>>,
  Expect<Extends<Product, Fabrication<typeof afterOverrideBuilt>>>,
  Expect<Extends<Fabrication<typeof afterAsBuilt>, Product>>,
  Expect<Extends<Product, Fabrication<typeof afterAsBuilt>>>,
  Expect<Extends<Fabrication<typeof afterAdaptBuilt>, Product>>,
  Expect<Extends<Product, Fabrication<typeof afterAdaptBuilt>>>,
  Expect<
    Extends<
      Fabrication<typeof afterExtendCheckedBuilt>,
      { id: string; price: number; sku: string }
    >
  >,
];

const afterStringAs = stringOk.as(() => "x");
const afterBooleanWeighted = booleanOk.weighted({ true: 2 });
const afterArrayAs = T.array(T.string.whereby({ length: { max: 1 } }))
  .whereby({ length: { max: 2 } })
  .satisfies<string[]>()
  .as(() => ["a"]);
const afterArrayAdapt = arrayOk.adapt(adapter, () => "ok");
const afterAlwaysAdapt = alwaysOk.adapt(adapter, () => "ok");
const afterNullableWeighted = nullableOk.weighted({ null: 0.1 });

const afterStringAsBuilt = new Fabricator(afterStringAs);
const afterBooleanWeightedBuilt = new Fabricator(afterBooleanWeighted);
const afterArrayAsBuilt = new Fabricator(afterArrayAs);
const afterArrayAdaptBuilt = new Fabricator(afterArrayAdapt);
const afterAlwaysAdaptBuilt = new Fabricator(afterAlwaysAdapt);
const afterNullableWeightedBuilt = new Fabricator(afterNullableWeighted);

export type BuilderAfterSatisfiesAssertions = [
  Expect<Extends<Fabrication<typeof afterStringAsBuilt>, string>>,
  Expect<Extends<string, Fabrication<typeof afterStringAsBuilt>>>,
  Expect<Extends<Fabrication<typeof afterBooleanWeightedBuilt>, boolean>>,
  Expect<Extends<boolean, Fabrication<typeof afterBooleanWeightedBuilt>>>,
  Expect<Extends<Fabrication<typeof afterArrayAsBuilt>, string[]>>,
  Expect<Extends<string[], Fabrication<typeof afterArrayAsBuilt>>>,
  Expect<Extends<Fabrication<typeof afterArrayAdaptBuilt>, string[]>>,
  Expect<Extends<Fabrication<typeof afterAlwaysAdaptBuilt>, string>>,
  Expect<
    Extends<Fabrication<typeof afterNullableWeightedBuilt>, string | null>
  >,
];

/* -------------------------------------------------------------------------- */
/*  Bare builders are not schemas — no `.satisfies` until configured.         */
/*  Wrapped so bun test never evaluates the missing-method calls.             */
/* -------------------------------------------------------------------------- */

function rejectBareBuilders() {
  // @ts-expect-error — T.string is a builder, not a Schema
  T.string.satisfies<string>();
  // @ts-expect-error — T.array(...) is a builder until `.whereby` / `.as`
  T.array(T.always("x")).satisfies<string[]>();
  // @ts-expect-error — T.bigint is a builder until `.whereby` / `.as`
  T.bigint.satisfies<bigint>();
  const recordBuilder = T.record(
    T.string.whereby({ length: { max: 4 } }),
    T.always(1),
  );
  // @ts-expect-error — T.record(...) is a builder until `.whereby` / `.as`
  recordBuilder.satisfies<Record<string, number>>();
  const recursiveBuilder = T.recursive((self) =>
    T.object({ n: T.omittable(self) }),
  );
  // @ts-expect-error — T.recursive(...) is a builder until `.whereby`
  recursiveBuilder.satisfies<unknown>();
}

/* -------------------------------------------------------------------------- */
/*  Standalone `satisfies<T>(…)` — schemas, extra/missing/wrong fields,       */
/*  nested array, recursive, conforming and non-conforming built Fabricators. */
/*  The rejected Fabricator is what guards `fabricate?: never`.               */
/* -------------------------------------------------------------------------- */

satisfies<Product>(ProductSchema);
satisfies<Product>(extraFields);
satisfies<Order>(OrderSchema);
satisfies<Tree>(recursiveOk);
satisfies<Product>(Products);

const ThirdPartyProductSchema = T.object({ id, price });
satisfies<Product>(ThirdPartyProductSchema);

// @ts-expect-error — missing price
satisfies<Product>(T.object({ id }));
// @ts-expect-error — price is a string
satisfies<Product>(T.object({ id, price: id }));
// @ts-expect-error — built Fabricator missing price; must not fall through
satisfies<Product>(new Fabricator(T.object({ id })));

const nestedStringArrays = T.array(
  T.array(T.always("x")).whereby({ length: { max: 2 } }),
).whereby({ length: { max: 2 } });
satisfies<string[][]>(nestedStringArrays);
// @ts-expect-error — nested array of strings is not number[][]
satisfies<number[][]>(nestedStringArrays);
// @ts-expect-error — recursive value is number, not string
satisfies<{ value: string; children: never[] }>(recursiveOk);

/* -------------------------------------------------------------------------- */
/*  `T.optional` vs `T.omittable` under `exactOptionalPropertyTypes`.         */
/* -------------------------------------------------------------------------- */

type NoteOptional = { id: string; note?: string };
type NoteUndefinable = { id: string; note?: string | undefined };

const omittableNote = T.object({
  id,
  note: T.omittable(T.string.whereby({ length: { max: 40 } })),
}).satisfies<NoteOptional>();
const omittableNoteWide = T.object({
  id,
  note: T.omittable(T.string.whereby({ length: { max: 40 } })),
}).satisfies<NoteUndefinable>();
const optionalNoteWide = T.object({
  id,
  note: T.optional(T.string.whereby({ length: { max: 40 } })),
}).satisfies<NoteUndefinable>();
// @ts-expect-error — T.optional produces note?: string | undefined
const optionalNoteNarrow = T.object({
  id,
  note: T.optional(T.string.whereby({ length: { max: 40 } })),
}).satisfies<NoteOptional>();

/* -------------------------------------------------------------------------- */
/*  Type-only `SatisfiedBy` + `Expect`.                                          */
/* -------------------------------------------------------------------------- */

export type SatisfiesAssertions = [
  Expect<SatisfiedBy<Product, typeof ProductSchema>>,
  Expect<SatisfiedBy<Product, typeof Products>>,
  Expect<SatisfiedBy<Product, typeof extraFields>>,
  Expect<SatisfiedBy<NoteOptional, typeof omittableNote>>,
  Expect<SatisfiedBy<NoteUndefinable, typeof optionalNoteWide>>,
];

const incompleteProduct = T.object({ id });
const optionalNoteSchema = T.object({
  id,
  note: T.optional(T.string.whereby({ length: { max: 40 } })),
});

export type SatisfiesFailure = Expect<
  // @ts-expect-error — missing price
  SatisfiedBy<Product, typeof incompleteProduct>
>;
export type OptionalSatisfiesFailure = Expect<
  // @ts-expect-error — T.optional vs note?: string
  SatisfiedBy<NoteOptional, typeof optionalNoteSchema>
>;

/**
 * Keep the conforming / rejected fixtures referenced so `noUnusedLocals` does
 * not treat a missing `@ts-expect-error` as an unused binding.
 */
export const fixtures = {
  alwaysOk,
  arrayOk,
  bigintOk,
  booleanOk,
  choiceOk,
  dateOk,
  datePastOk,
  numberIntegerOk,
  deriveOk,
  enumOk,
  nullOk,
  nullableOk,
  nullishOk,
  numberOk,
  objectOk,
  omittableOk,
  optionalOk,
  opaqueOk,
  recordOk,
  recursiveOk,
  recursiveSelfOk,
  stringOk,
  symbolOk,
  tupleOk,
  undefinableOk,
  undefinedOk,
  computeOk,
  alwaysBad,
  arrayBad,
  bigintBad,
  booleanBad,
  choiceBad,
  dateBad,
  deriveBad,
  enumBad,
  nullBad,
  nullableBad,
  nullishBad,
  numberBad,
  objectBad,
  omittableBad,
  optionalBad,
  opaqueBad,
  recordBad,
  recursiveBad,
  recursiveSelfBad,
  stringBad,
  symbolBad,
  tupleBad,
  undefinableBad,
  undefinedBad,
  computeBad,
  nestedConforming,
  nestedNonconforming,
  extraFields,
  OrderSchema,
  repeated,
  drifted,
  driftedRechecked,
  omittableNote,
  omittableNoteWide,
  optionalNoteWide,
  optionalNoteNarrow,
  rejectBareBuilders,
};

test(".satisfies() returns the same object; standalone satisfies() is a no-op", () => {
  const schema = T.object({ id, price });
  expect(schema.satisfies<Product>()).toBe(schema);
  expect(satisfies<Product>(schema)).toBeUndefined();
  expect(new Fabricator(OrderSchema).fabricate().product.price).toBeGreaterThan(
    0,
  );
});
