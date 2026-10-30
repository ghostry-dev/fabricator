import { initialize } from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * Compile-time assertions that `fabricate(schema)` is typed exactly as `new
 * Fabricator(schema).fabricate()` is, for the kinds whose value type is easiest
 * to lose: an object, ones that may produce `undefined` (checked under both
 * `exactOptionalPropertyTypes` settings, see `tsconfig.inexact.json`), a
 * derive, and a recursive tree.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

const { T, Fabricator, fabricate } = initialize({ salt: "fabricate-types" });

const Obj = T.object({
  a: T.number,
  b: T.omittable(T.boolean),
  c: T.optional(T.enum.uniform(["x", "y"])),
});
const Undefinable = T.undefinable(T.number);
const Derived = T.derive({ to: T.number, from: [T.number, T.number] }).as(
  ([a, b]) => a + b,
);
const Tree = T.recursive((self) =>
  T.object({
    value: T.number,
    children: T.array(self).whereby({ length: { max: 2 } }),
  }),
).whereby({ depth: { max: 2 } });

const obj = fabricate(Obj);
const undefinable = fabricate(Undefinable);
const undefinedValue = fabricate(T.undefined);
const derived = fabricate(Derived);
const tree = fabricate(Tree);

type Built<$Schema> = $Schema extends { fabricate: () => infer $T }
  ? $T
  : never;

export type Assertions = [
  Expect<Equal<typeof obj, Built<typeof builtObj>>>,
  Expect<Equal<typeof undefinable, Built<typeof builtUndefinable>>>,
  Expect<Equal<typeof undefinable, number | undefined>>,
  Expect<Equal<typeof undefinedValue, undefined>>,
  Expect<Equal<typeof derived, Built<typeof builtDerived>>>,
  Expect<Equal<typeof derived, number>>,
  Expect<Equal<typeof tree, Built<typeof builtTree>>>,
];

const builtObj = new Fabricator(Obj);
const builtUndefinable = new Fabricator(Undefinable);
const builtDerived = new Fabricator(Derived);
const builtTree = new Fabricator(Tree);

test("compiles", () => {
  expect(true).toBe(true);
});
