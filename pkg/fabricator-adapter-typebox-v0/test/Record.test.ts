import { expect, test } from "bun:test";
import { initialize, registry } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";

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
  const { T } = initialize({ seed: "record-symbol-typebox" });

  const schema = T.record(T.symbol, value(T)).whereby({ size: { max: 3 } });

  expect(() => toTypeBox(schema)).toThrow(/symbol/);
  expect(() => toTypeBox(schema)).toThrow(/adapt/);
});

test("toTypeBox maps a string-keyed record to patternProperties", () => {
  const { T } = initialize({ seed: "record-typebox" });

  const schema = toTypeBox(
    T.record(key(T), value(T)).whereby({ size: { max: 3 } }),
  );

  expect(schema.type).toBe("object");
  expect(Object.keys(schema.patternProperties)).toEqual(["^(.*)$"]);
  expect(schema.patternProperties["^(.*)$"]!.type).toBe("integer");
});

/** A literal-union key collapses to a `TObject` of those properties. */
test("toTypeBox collapses a literal-union key to an object", () => {
  const { T } = initialize({ seed: "record-typebox-enum" });

  const schema = toTypeBox(
    T.record(T.enum.uniform(["a", "b"]), value(T)).whereby({
      size: { max: 2 },
    }),
  );

  expect(schema.type).toBe("object");
  expect(Object.keys(schema.properties).sort()).toEqual(["a", "b"]);
});
