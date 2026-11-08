import { initialize, registry } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";
import { Value } from "@sinclair/typebox/value";
import { expect, test } from ".";

/**
 * The registry `initialize()` hands back, so the helpers below stay typed.
 * Instantiated explicitly: a bare `ReturnType<typeof initialize>` resolves the
 * type parameter to its _constraint_ (`PlainObject`) rather than its default,
 * which would leave every `T.<kind>` as `unknown`.
 */
type Registry = ReturnType<typeof initialize<typeof registry>>["T"];

/** Bounded so keys are short, distinct-ish, and readable in a failure. */
const key = (T: Registry) =>
  T.string.whereby({
    length: { min: 4, max: 8 },
    composition: { lowercase: 1 },
  });

/** Bounded so the assertions below read clearly against a known range. */
const value = (T: Registry) => T.number.integer.whereby({ min: 0, max: 1000 });

/**
 * `Type.Record` answers an unrepresentable key with `TNever` rather than
 * raising — a schema nothing validates against, produced silently. This is the
 * assertion that would catch a regression back to that.
 */
test("toTypeBox throws on a symbol-keyed record rather than emitting TNever", () => {
  const { T } = initialize({ salt: "record-symbol-typebox" });

  const schema = T.record(T.symbol, value(T)).whereby({ size: { max: 3 } });

  expect(() => toTypeBox(schema)).toThrow(/symbol/);
  expect(() => toTypeBox(schema)).toThrow(/adapt/);
});

test("toTypeBox maps a string-keyed record to patternProperties", () => {
  const { T } = initialize({ salt: "record-typebox" });

  const schema = toTypeBox(
    T.record(key(T), value(T)).whereby({ size: { max: 3 } }),
  );

  expect(schema.type).toBe("object");
  expect(Object.keys(schema.patternProperties)).toEqual(["^(.*)$"]);
  expect(schema.patternProperties["^(.*)$"]!.type).toBe("integer");
});

/** A literal-union key collapses to a `TObject` of those properties. */
test("toTypeBox collapses a literal-union key to an object", () => {
  const { T } = initialize({ salt: "record-typebox-enum" });

  const schema = toTypeBox(
    T.record(T.enum.uniform(["a", "b"]), value(T)).whereby({
      size: { max: 2 },
    }),
  );

  expect(schema.type).toBe("object");
  expect(Object.keys(schema.properties).sort()).toEqual(["a", "b"]);
});

/**
 * A plain record states its written `size.max` and no minimum: `minTried`
 * counts attempts, and colliding keys collapse below it. Two possible keys and
 * up to eight attempts collide on nearly every draw, and every result still
 * validates.
 */
test.each([{ minTried: 0 }, { minTried: 3 }] as const)(
  "a plain record with minTried $minTried states only maxProperties",
  ({ row }) => {
    const { T, Fabricator } = initialize({ salt: "record-typebox-count" });
    const schema = T.record(
      T.string.whereby({ length: 1, composition: [[1, "ab"]] }),
      value(T),
    ).whereby({ size: { minTried: row.minTried, max: 8 } });

    const mapped = toTypeBox(schema);
    expect(mapped.minProperties).toBeUndefined();
    expect(mapped.maxProperties).toBe(8);

    for (let salt = 0; salt < 200; salt++) {
      const built = new Fabricator(schema, { salt: String(salt) });
      expect(Value.Check(mapped, built.fabricate())).toBe(true);
    }
  },
);

/**
 * A literal-union key collapses to an object; nothing written promises every
 * key, so a record that drew only one still validates.
 */
test("a literal-union record's properties are optional", () => {
  const { T, Fabricator } = initialize({ salt: "record-typebox-partial" });
  const schema = T.record(T.enum.uniform(["a", "b"]), value(T)).whereby({
    size: { max: 2 },
  });

  const mapped = toTypeBox(schema);
  expect(mapped.required).toBeUndefined();
  expect(Value.Check(mapped, { a: 1 })).toBe(true);
  expect(Value.Check(mapped, {})).toBe(true);

  for (let salt = 0; salt < 100; salt++) {
    const built = new Fabricator(schema, { salt: String(salt) });
    expect(Value.Check(mapped, built.fabricate())).toBe(true);
  }
});
