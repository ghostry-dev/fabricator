import { toKeyer } from "@ghostry/fabricator/internal";
import { expect, test } from ".";

/**
 * `toKeyer` is what a tracked unique scope stores in place of a value. Each
 * case asserts equality of keys, which is the only thing the scope reads.
 */
function same(a: unknown, b: unknown): boolean {
  const keyer = toKeyer();
  return keyer(a) === keyer(b);
}

test("primitives compare by SameValueZero", () => {
  expect(same(0, -0)).toBe(true);
  expect(same(Number.NaN, Number.NaN)).toBe(true);
  expect(same("1", 1)).toBe(false);
  expect(same(BigInt(1), 1)).toBe(false);
  expect(same(null, undefined)).toBe(false);
  expect(same(true, "t")).toBe(false);
});

test("a key is a 53-bit integer", () => {
  const key = toKeyer()({ a: [1, "two", null] });
  expect(Number.isSafeInteger(key)).toBe(true);
  expect(key).toBeGreaterThanOrEqual(0);
});

test("dates compare by time value", () => {
  expect(same(new Date(5), new Date(5))).toBe(true);
  expect(same(new Date(5), new Date(6))).toBe(false);
  expect(same(new Date(5), 5)).toBe(false);
});

test("plain objects compare by content in any key order", () => {
  expect(same({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  expect(same({ a: 1 }, { a: 2 })).toBe(false);
  expect(same({ a: { b: [1] } }, { a: { b: [1] } })).toBe(true);
});

test("a key present as undefined differs from an absent one", () => {
  expect(same({ a: undefined }, {})).toBe(false);
});

test("arrays compare element by element", () => {
  expect(same([1, [2, 3]], [1, [2, 3]])).toBe(true);
  expect(same([1, 2], [2, 1])).toBe(false);
  expect(same(["a,b"], ["a", "b"])).toBe(false);
  expect(same([], {})).toBe(false);
});

test("symbols and objects that are not plain data compare by identity", () => {
  const keyer = toKeyer();
  const symbol = Symbol("s");
  const map = new Map([["a", 1]]);

  expect(keyer(symbol)).toBe(keyer(symbol));
  expect(keyer(Symbol("s"))).not.toBe(keyer(Symbol("s")));
  expect(keyer(map)).toBe(keyer(map));
  expect(keyer(new Map([["a", 1]]))).not.toBe(keyer(new Map([["a", 1]])));
  expect(keyer({ k: map })).toBe(keyer({ k: map }));
});

test("symbol keys on a plain object take part by identity", () => {
  const keyer = toKeyer();
  const key = Symbol("k");

  expect(keyer({ [key]: 1 })).toBe(keyer({ [key]: 1 }));
  expect(keyer({ [key]: 1 })).not.toBe(keyer({ [key]: 2 }));
  expect(keyer({ [key]: 1 })).not.toBe(keyer({ [Symbol("k")]: 1 }));
});

test("a cycle is encoded by identity rather than followed", () => {
  const keyer = toKeyer();
  const cyclic: Record<string, unknown> = { a: 1 };
  cyclic["self"] = cyclic;

  expect(keyer(cyclic)).toBe(keyer(cyclic));
});
