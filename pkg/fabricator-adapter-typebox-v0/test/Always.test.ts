import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";

/**
 * `always`/`enum` are no longer capped at `string | number | boolean`. These
 * cover that the TypeBox mapping _pins_ the widened values rather than widening
 * to "any bigint"/"any date" (see `toConst` in `../src/index.ts`).
 *
 * Every pinning assertion is deliberately two-directional. A bare
 * `Type.BigInt()` accepts `BigInt(5)` perfectly happily, so a lone positive
 * check would pass against exactly the unpinned mapping these tests exist to
 * rule out — only the paired rejection proves the option bag is being set.
 */

test("toTypeBox pins an always-ed bigint to that exact value", () => {
  const { T } = initialize({ seed: "always-bigint" });

  const schema = toTypeBox(T.always(BigInt(5)));

  expect(Value.Check(schema, BigInt(5))).toBe(true);
  expect(Value.Check(schema, BigInt(6))).toBe(false);
  expect(Value.Check(schema, BigInt(4))).toBe(false);
});

test("toTypeBox pins an always-ed date to that exact instant", () => {
  const { T } = initialize({ seed: "always-date" });

  const schema = toTypeBox(T.always(new Date(0)));

  expect(Value.Check(schema, new Date(0))).toBe(true);
  expect(Value.Check(schema, new Date(1))).toBe(false);
});

test("toTypeBox pins null/undefined always-es", () => {
  const { T } = initialize({ seed: "always-nullish" });

  const nullSchema = toTypeBox(T.always(null));
  expect(Value.Check(nullSchema, null)).toBe(true);
  expect(Value.Check(nullSchema, undefined)).toBe(false);

  const undefinedSchema = toTypeBox(T.always(undefined));
  expect(Value.Check(undefinedSchema, undefined)).toBe(true);
  expect(Value.Check(undefinedSchema, null)).toBe(false);
});

/**
 * The reason `toConst` recurses itself instead of handing a whole object to
 * `Type.Const`: without that, a nested pinnable value would silently come out
 * unpinned while the same value at the top level came out exact.
 */
test("toTypeBox pins values nested inside an always-ed object or array", () => {
  const { T } = initialize({ seed: "always-nested" });

  const object = toTypeBox(T.always({ at: new Date(0), id: BigInt(5) }));

  expect(Value.Check(object, { at: new Date(0), id: BigInt(5) })).toBe(true);
  expect(Value.Check(object, { at: new Date(1), id: BigInt(5) })).toBe(false);
  expect(Value.Check(object, { at: new Date(0), id: BigInt(6) })).toBe(false);

  const array = toTypeBox(T.always([new Date(0), BigInt(5)]));

  expect(Value.Check(array, [new Date(0), BigInt(5)])).toBe(true);
  expect(Value.Check(array, [new Date(1), BigInt(5)])).toBe(false);
});

/**
 * Not everything is pinnable, and the honest boundary is worth asserting so it
 * is not mistaken for a bug later: TypeBox's `Symbol(options?)` takes no value
 * constraint, and `Uint8Array` can only express a byte length. `.adapt(typebox,
 * ...)` is the escape hatch for both.
 */
test("toTypeBox widens where TypeBox cannot pin: symbols, and Uint8Array contents", () => {
  const { T } = initialize({ seed: "always-unpinnable" });

  const symbolSchema = toTypeBox(T.always(Symbol("s")));
  expect(Value.Check(symbolSchema, Symbol("something else"))).toBe(true);

  const bytesSchema = toTypeBox(T.always(new Uint8Array([1, 2])));
  expect(Value.Check(bytesSchema, new Uint8Array([9, 9]))).toBe(true);
  expect(Value.Check(bytesSchema, new Uint8Array([1]))).toBe(false);
});

test("a string/number/boolean always still maps to a plain literal", () => {
  const { T } = initialize({ seed: "always-literal" });

  const literal = toTypeBox(T.always("hello"));
  expect(literal.type).toBe("string");
  expect(literal.const).toBe("hello");

  const schema = toTypeBox(T.always(42));
  expect(Value.Check(schema, 42)).toBe(true);
  expect(Value.Check(schema, 43)).toBe(false);
});

/**
 * `toConst` recurses through objects and arrays itself (to pin nested values),
 * which only stays sound if its structure matches what `Type.Const` would have
 * produced — otherwise the runtime output would drift from the type-level
 * `ToConst`, which is a plain `TConst`. The readonly marking is the easy half
 * to get wrong.
 */
test("toConst's own recursion matches Type.Const structurally", () => {
  const { T } = initialize({ seed: "always-mirrors-const" });

  for (const value of [{ a: 1, b: "x" }, [1, "a"], { a: [1, { b: 2 }] }]) {
    expect(JSON.stringify(toTypeBox(T.always(value)))).toBe(
      JSON.stringify(Type.Const(value)),
    );
  }
});

test("toTypeBox maps a widened enum to a union that pins each member", () => {
  const { T } = initialize({ seed: "enum-typebox" });

  const schema = toTypeBox(T.enum.uniform([null, BigInt(5)]));

  expect(Value.Check(schema, null)).toBe(true);
  expect(Value.Check(schema, BigInt(5))).toBe(true);
  expect(Value.Check(schema, BigInt(6))).toBe(false);
  expect(Value.Check(schema, undefined)).toBe(false);
});
