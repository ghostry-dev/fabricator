import { Type } from "@sinclair/typebox";
import { expect, test } from "bun:test";
import { initialize, registry } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";

const { T } = initialize({ types: registry });

test("number bounds map to minimum / exclusiveMinimum", () => {
  const inclusive = toTypeBox(T.number.whereby({ min: 0, max: 10 }));
  expect(inclusive.minimum).toBe(0);
  expect(inclusive.maximum).toBe(10);
  expect(inclusive.exclusiveMinimum).toBeUndefined();
  expect(inclusive.exclusiveMaximum).toBeUndefined();

  const exclusive = toTypeBox(
    T.number.whereby({
      min: { value: 0, exclusive: true },
      max: { value: 1, exclusive: true },
    }),
  );
  expect(exclusive.exclusiveMinimum).toBe(0);
  expect(exclusive.exclusiveMaximum).toBe(1);
  expect(exclusive.minimum).toBeUndefined();
  expect(exclusive.maximum).toBeUndefined();
});

test("integer bounds use Type.Integer with the stated Bound", () => {
  const schema = toTypeBox(
    T.number.integer.whereby({ min: 0, max: { value: 10, exclusive: true } }),
  );
  expect(schema.type).toBe("integer");
  expect(schema.minimum).toBe(0);
  expect(schema.exclusiveMaximum).toBe(10);
});

test("bigint bounds map to minimum / exclusiveMinimum", () => {
  const schema = toTypeBox(
    T.bigint.whereby({
      min: BigInt(0),
      max: { value: BigInt(10), exclusive: true },
    }),
  );
  expect(schema.minimum).toBe(BigInt(0));
  expect(schema.exclusiveMaximum).toBe(BigInt(10));
});

test("date bounds map to timestamp keywords", () => {
  const min = new Date("2000-01-01T00:00:00.000Z");
  const max = new Date("2000-01-02T00:00:00.000Z");
  const schema = toTypeBox(
    T.date.whereby({ min, max: { value: max, exclusive: true } }),
  );
  expect(schema.minimumTimestamp).toBe(min.getTime());
  expect(schema.exclusiveMaximumTimestamp).toBe(max.getTime());
});

test("string length maps through the effective inclusive integers", () => {
  const schema = toTypeBox(
    T.string.whereby({
      length: { min: { value: 0, exclusive: true }, max: 8 },
    }),
  );
  expect(schema.minLength).toBe(1);
  expect(schema.maxLength).toBe(8);
});

test("array length: 3 is minItems = maxItems = 3", () => {
  const schema = toTypeBox(T.array(T.boolean).whereby({ length: 3 }));
  expect(schema.minItems).toBe(3);
  expect(schema.maxItems).toBe(3);
  expect(Type.Array(Type.Boolean()).minItems).toBeUndefined();
});

test("a bare number has no range keywords", () => {
  const schema = toTypeBox(T.number);
  expect(schema.minimum).toBeUndefined();
  expect(schema.maximum).toBeUndefined();
});

test("an omitted number end is not forwarded as a cap", () => {
  const schema = toTypeBox(T.number.whereby({ min: 0 }));
  expect(schema.minimum).toBe(0);
  expect(schema.maximum).toBeUndefined();
});
