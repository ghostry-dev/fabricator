import { Value } from "@sinclair/typebox/value";
import { expect, test } from ".";
import { initialize } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";

test("a unique array maps to uniqueItems, and a plain array does not", () => {
  const { T } = initialize({ salt: "unique-typebox-array" });
  const element = T.enum.uniform(["a", "b", "c"]);

  const unique = toTypeBox(T.unique.array(element).whereby({ length: 2 }));
  expect(unique.uniqueItems).toBe(true);
  expect(unique.minItems).toBe(2);
  expect(unique.maxItems).toBe(2);
  expect(Value.Check(unique, ["a", "a"])).toBe(false);

  const plain = toTypeBox(T.array(element).whereby({ length: 2 }));
  expect(plain.uniqueItems).toBeUndefined();
});

test("a unique array's fabricated values pass its own uniqueItems schema", () => {
  const { T, Fabricator } = initialize({ salt: "unique-typebox-check" });
  const schema = T.unique
    .array(T.object({ id: T.number.integer.whereby({ min: 1, max: 9 }) }))
    .by((row) => row.id)
    .whereby({ length: { max: 9 } });

  const mapped = toTypeBox(schema);
  const built = new Fabricator(schema);
  for (let i = 0; i < 100; i++) {
    expect(Value.Check(mapped, built.fabricate())).toBe(true);
  }
});

test("a unique record states its drawn property count, and a plain record what survives collisions", () => {
  const { T, Fabricator } = initialize({ salt: "unique-typebox-record" });
  const key = T.string.whereby({ length: 6, composition: { lowercase: 1 } });

  const schema = T.unique
    .record(key, T.boolean)
    .whereby({ size: { min: 2, max: 4 } });
  const mapped = toTypeBox(schema);
  expect(mapped.minProperties).toBe(2);
  expect(mapped.maxProperties).toBe(4);

  const built = new Fabricator(schema);
  for (let i = 0; i < 100; i++) {
    expect(Value.Check(mapped, built.fabricate())).toBe(true);
  }

  const plain = toTypeBox(
    T.record(key, T.boolean).whereby({ size: { minTried: 2, max: 4 } }),
  );
  expect(plain.minProperties).toBe(1);
  expect(plain.maxProperties).toBe(4);
});
