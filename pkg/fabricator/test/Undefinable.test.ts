import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("an undefinable field's key is always present, its value sometimes undefined", () => {
  const { T, Fabricator } = initialize({ salt: "undefinable-value" });

  const built = new Fabricator(
    T.object({ a: T.undefinable(T.string.whereby({ length: { max: 5 } })) }),
  );

  let sawValue = false;
  let sawUndefined = false;

  for (let i = 0; i < 100 && !(sawValue && sawUndefined); i++) {
    const result = built.fabricate();
    expect("a" in result).toBe(true);
    if (result.a === undefined) sawUndefined = true;
    else {
      sawValue = true;
      expect(typeof result.a).toBe("string");
    }
  }

  expect(sawValue).toBe(true);
  expect(sawUndefined).toBe(true);
});

test("an undefinable field's roll never disturbs its object's other randomness", () => {
  const salt = "undefinable-no-disturb";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    salt,
    clock: "derived",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    salt,
    clock: "derived",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withUndefinable = new Fabricator2(
    T2.object({
      a: T2.undefinable(T2.string.whereby({ length: { max: 5 } })),
      b: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withUndefinable.fabricate().b).toBe(plain.fabricate().b);
  }
});

test("unlike T.omittable, T.undefinable builds and fabricates standalone, outside any object", () => {
  const { T, Fabricator } = initialize({ salt: "undefinable-standalone" });

  const built = new Fabricator(T.string.whereby({ length: { max: 5 } }));
  const undefinableBuilt = new Fabricator(
    T.undefinable(T.string.whereby({ length: { max: 5 } })),
  );

  const result = undefinableBuilt.fabricate();
  expect(result === undefined || typeof result === "string").toBe(true);
  expect(typeof built.fabricate()).toBe("string");
});

test(".override({ key: value }) forces an undefinable field to that value", () => {
  const { T, Fabricator } = initialize({ salt: "undefinable-override-value" });

  const schema = T.object({
    a: T.undefinable(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: "forced" });

  expect(new Fabricator(schema).fabricate().a).toBe("forced");
});

test(".override({ key: undefined }) forces an undefinable field to undefined", () => {
  const { T, Fabricator } = initialize({
    salt: "undefinable-override-undefined",
  });

  const schema = T.object({
    a: T.undefinable(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: undefined });

  const result = new Fabricator(schema).fabricate();
  expect("a" in result).toBe(true);
  expect(result.a).toBeUndefined();
});

test("fabricate({ key: undefined }) forces an undefinable field to undefined for that call only", () => {
  const { T, Fabricator } = initialize({
    salt: "undefinable-fabricate-undefined",
  });

  const built = new Fabricator(
    T.object({ a: T.undefinable(T.string.whereby({ length: { max: 5 } })) }),
  );

  const forced = built.fabricate({ a: undefined });
  expect("a" in forced).toBe(true);
  expect(forced.a).toBeUndefined();

  // Not baked into the Fabricator — the next call rolls again normally.
  let sawValueAgain = false;
  for (let i = 0; i < 50 && !sawValueAgain; i++) {
    if (built.fabricate().a !== undefined) sawValueAgain = true;
  }
  expect(sawValueAgain).toBe(true);
});

test("an override value that violates an undefinable field's inner kind throws", () => {
  const { T } = initialize({ salt: "undefinable-kind-violation" });

  const schema = T.object({
    a: T.undefinable(T.string.whereby({ length: { max: 5 } })),
  });

  expect(() => schema.override({ a: 5 as unknown as string })).toThrow();
});

test(".weighted(...) reweights relative to a fixed baseline of 1 for the unspecified outcome", () => {
  const { T, Fabricator } = initialize({ salt: "undefinable-weighted" });

  const built = new Fabricator(
    T.undefinable(T.string.whereby({ length: { max: 5 } })).weighted({
      undefined: 0.1,
    }),
  );

  let absent = 0;
  let value = 0;
  const n = 12000;

  for (let i = 0; i < n; i++) {
    if (built.fabricate() === undefined) absent++;
    else value++;
  }

  // Weights are undefined=0.1, value=1 (sum 1.1) — undefined should land
  // near 0.1/1.1 ≈ 9.1%, not 50%, and value near 1/1.1 ≈ 90.9%.
  expect(absent).toBeGreaterThan(n * 0.06);
  expect(absent).toBeLessThan(n * 0.13);
  expect(value).toBeGreaterThan(n * 0.87);
  expect(value).toBeLessThan(n * 0.94);
});

test(".as(...) replaces the roll with an opaque producer, which may itself return undefined", () => {
  const { T, Fabricator } = initialize({ salt: "undefinable-as" });

  const alwaysValue = new Fabricator(
    T.object({
      a: T.undefinable(T.string.whereby({ length: { max: 5 } })).as(
        () => "fixed",
      ),
    }),
  );
  expect(alwaysValue.fabricate()).toEqual({ a: "fixed" });
  expect(alwaysValue.fabricate()).toEqual({ a: "fixed" });

  const alwaysUndefined = new Fabricator(
    T.object({
      a: T.undefinable(T.string.whereby({ length: { max: 5 } })).as(
        () => undefined,
      ),
    }),
  );
  expect(alwaysUndefined.fabricate()).toEqual({ a: undefined });
});

test("an undefinable field nested in an array of objects resolves independently per element", () => {
  const { T, Fabricator } = initialize({ salt: "undefinable-in-array" });

  const built = new Fabricator(
    T.array(
      T.object({ a: T.undefinable(T.string.whereby({ length: { max: 5 } })) }),
    ).whereby({ length: { min: 40, max: 60 } }),
  );

  const results = built.fabricate();
  const hasValue = new Set(results.map((r) => r.a !== undefined));

  expect(hasValue.has(true)).toBe(true);
  expect(hasValue.has(false)).toBe(true);
});
