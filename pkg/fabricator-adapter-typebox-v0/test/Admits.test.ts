/**
 * `.admits(...)` widens what the adapter states while fabrication draws what
 * `whereby` says, so every fabricated value still passes the admitted schema.
 *
 * @module
 */

import { initialize } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";
import { Value } from "@sinclair/typebox/value";
import { expect, test } from ".";

test("an admitted length replaces the drawn one, and Infinity drops it", () => {
  const { T, Fabricator } = initialize({ salt: "admits-typebox-length" });
  const schema = T.string
    .whereby({ length: { min: 1, max: 40 } })
    .admits({ length: { max: Infinity } });

  const mapped = toTypeBox(schema);
  expect(mapped.minLength).toBe(1);
  expect(mapped.maxLength).toBeUndefined();
  expect(Value.Check(mapped, "x".repeat(10_000))).toBe(true);

  const built = new Fabricator(schema);
  for (let i = 0; i < 200; i++) {
    expect(Value.Check(mapped, built.fabricate())).toBe(true);
  }
});

test("an admitted array length states a wider count", () => {
  const { T } = initialize({ salt: "admits-typebox-array" });
  const mapped = toTypeBox(
    T.array(T.always(1))
      .whereby({ length: { max: 20 } })
      .admits({ length: { max: 10_000 } }),
  );

  expect(mapped.minItems).toBe(0);
  expect(mapped.maxItems).toBe(10_000);
});

test("admitted ends replace the drawn ones for number, bigint, and date", () => {
  const { T } = initialize({ salt: "admits-typebox-ends" });

  const number = toTypeBox(
    T.number.whereby({ min: 0, max: 1 }).admits({ max: Infinity }),
  );
  expect(number.minimum).toBe(0);
  expect(number.maximum).toBeUndefined();

  const bigint = toTypeBox(
    T.bigint.whereby({ min: 0, max: 1000 }).admits({ max: Infinity }),
  );
  expect(bigint.minimum).toBe(BigInt(0));
  expect(bigint.maximum).toBeUndefined();

  const date = toTypeBox(
    T.date
      .whereby({ min: Date.UTC(2000, 0), max: Date.UTC(2030, 0) })
      .admits({ min: -Infinity, max: Infinity }),
  );
  expect(date.minimumTimestamp).toBeUndefined();
  expect(date.maximumTimestamp).toBeUndefined();
});

test("a record's admitted size replaces its written one", () => {
  const { T } = initialize({ salt: "admits-typebox-record" });
  const key = T.string.whereby({ length: 4 });

  const widened = toTypeBox(
    T.record(key, T.always(1))
      .whereby({ size: { max: 5 } })
      .admits({ size: { max: Infinity } }),
  );
  expect(widened.minProperties).toBeUndefined();
  expect(widened.maxProperties).toBeUndefined();

  /** Written bounds are stated under `.as(produce)`, as for every kind. */
  const written = toTypeBox(
    T.record(key, T.always(1))
      .whereby({ size: { max: 5 } })
      .as(() => ({})),
  );
  expect(written.maxProperties).toBe(5);

  const produced = toTypeBox(
    T.record(key, T.always(1))
      .as(() => ({}))
      .admits({ size: { max: 100 } }),
  );
  expect(produced.minProperties).toBeUndefined();
  expect(produced.maxProperties).toBe(100);
});

test("admitted keywords are forwarded", () => {
  const { T } = initialize({ salt: "admits-typebox-keywords" });

  const string = toTypeBox(
    T.string.as(() => "a@b.c").admits({ format: "email", pattern: "@" }),
  );
  expect(string.format).toBe("email");
  expect(string.pattern).toBe("@");

  const number = toTypeBox(
    T.number.integer.whereby({ min: 0, max: 8 }).admits({ multipleOf: 2 }),
  );
  expect(number.multipleOf).toBe(2);
  expect(number.maximum).toBe(8);
});

/**
 * Every branch of a recursive tree ends at the depth limit with its collection
 * of `self` empty. Admitting `min: 0` states no minimum there, so every
 * fabricated tree validates while each level below the limit still draws one.
 */
test("a recursive collection admitting min 0 validates every fabricated tree", () => {
  const { T, Fabricator } = initialize({ salt: "admits-typebox-recursive" });
  const Tree = T.recursive((self) =>
    T.object({
      name: T.string.whereby({ length: 3, composition: { lowercase: 1 } }),
      children: T.array(self)
        .whereby({ length: { min: 1, max: 2 } })
        .admits({ length: { min: 0 } }),
    }),
  ).whereby({ depth: { max: 2 } });

  const mapped = toTypeBox(Tree);
  for (let salt = 0; salt < 100; salt++) {
    const built = new Fabricator(Tree, { salt: String(salt) });
    expect(Value.Check(mapped, built.fabricate())).toBe(true);
  }
});
