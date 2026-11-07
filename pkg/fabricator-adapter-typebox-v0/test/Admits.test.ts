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

test("a record's admitted size replaces its fabricable count", () => {
  const { T } = initialize({ salt: "admits-typebox-record" });
  const key = T.string.whereby({ length: 4 });

  const widened = toTypeBox(
    T.record(key, T.always(1))
      .whereby({ size: { max: 5 } })
      .admits({ size: { max: Infinity } }),
  );
  expect(widened.minProperties).toBe(0);
  expect(widened.maxProperties).toBeUndefined();

  const produced = toTypeBox(
    T.record(key, T.always(1))
      .as(() => ({}))
      .admits({ size: { max: 100 } }),
  );
  expect(produced.minProperties).toBeUndefined();
  expect(produced.maxProperties).toBe(100);
});
