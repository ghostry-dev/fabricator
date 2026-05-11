import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("a nullable field's key is always present, its value sometimes null", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-value" });

  const built = new Fabricator(
    T.object({ a: T.nullable(T.string.whereby({ length: { max: 5 } })) }),
  );

  let sawValue = false;
  let sawNull = false;

  for (let i = 0; i < 100 && !(sawValue && sawNull); i++) {
    const result = built.fabricate();
    expect("a" in result).toBe(true);
    if (result.a === null) sawNull = true;
    else {
      sawValue = true;
      expect(typeof result.a).toBe("string");
    }
  }

  expect(sawValue).toBe(true);
  expect(sawNull).toBe(true);
});

test("a nullable field's roll never disturbs its object's other randomness", () => {
  const seed = "nullable-no-disturb";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    seed,
    clock: "seeded",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    seed,
    clock: "seeded",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withNullable = new Fabricator2(
    T2.object({
      a: T2.nullable(T2.string.whereby({ length: { max: 5 } })),
      b: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withNullable.fabricate().b).toBe(plain.fabricate().b);
  }
});

test("unlike T.omittable, T.nullable builds and fabricates standalone, outside any object", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-standalone" });

  const built = new Fabricator(T.string.whereby({ length: { max: 5 } }));
  const nullableBuilt = new Fabricator(
    T.nullable(T.string.whereby({ length: { max: 5 } })),
  );

  const result = nullableBuilt.fabricate();
  expect(result === null || typeof result === "string").toBe(true);
  expect(typeof built.fabricate()).toBe("string");
});

test(".override({ key: value }) forces a nullable field to that value", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-override-value" });

  const schema = T.object({
    a: T.nullable(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: "forced" });

  expect(new Fabricator(schema).fabricate().a).toBe("forced");
});

test(".override({ key: null }) forces a nullable field to null", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-override-null" });

  const schema = T.object({
    a: T.nullable(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: null });

  const result = new Fabricator(schema).fabricate();
  expect("a" in result).toBe(true);
  expect(result.a).toBeNull();
});

test("fabricate({ key: null }) forces a nullable field to null for that call only", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-fabricate-null" });

  const built = new Fabricator(
    T.object({ a: T.nullable(T.string.whereby({ length: { max: 5 } })) }),
  );

  const forced = built.fabricate({ a: null });
  expect("a" in forced).toBe(true);
  expect(forced.a).toBeNull();

  // Not baked into the Fabricator — the next call rolls again normally.
  let sawValueAgain = false;
  for (let i = 0; i < 50 && !sawValueAgain; i++) {
    if (built.fabricate().a !== null) sawValueAgain = true;
  }
  expect(sawValueAgain).toBe(true);
});

test("an override value that violates a nullable field's inner kind throws", () => {
  const { T } = initialize({ seed: "nullable-kind-violation" });

  const schema = T.object({
    a: T.nullable(T.string.whereby({ length: { max: 5 } })),
  });

  expect(() => schema.override({ a: 5 as unknown as string })).toThrow();
});

test(".as(...) replaces the roll with an opaque producer, which may itself return null", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-as" });

  const alwaysValue = new Fabricator(
    T.object({
      a: T.nullable(T.string.whereby({ length: { max: 5 } })).as(() => "fixed"),
    }),
  );
  expect(alwaysValue.fabricate()).toEqual({ a: "fixed" });
  expect(alwaysValue.fabricate()).toEqual({ a: "fixed" });

  const alwaysNull = new Fabricator(
    T.object({
      a: T.nullable(T.string.whereby({ length: { max: 5 } })).as(() => null),
    }),
  );
  expect(alwaysNull.fabricate()).toEqual({ a: null });
});

test("a nullable field nested in an array of objects resolves independently per element", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-in-array" });

  const built = new Fabricator(
    T.array(
      T.object({ a: T.nullable(T.string.whereby({ length: { max: 5 } })) }),
    ).whereby({ length: { min: 40, max: 60 } }),
  );

  const results = built.fabricate();
  const hasValue = new Set(results.map((r) => r.a !== null));

  expect(hasValue.has(true)).toBe(true);
  expect(hasValue.has(false)).toBe(true);
});

test(".weighted(...) reweights relative to a fixed baseline of 1 for the unspecified outcome", () => {
  const { T, Fabricator } = initialize({ seed: "nullable-weighted" });

  const built = new Fabricator(
    T.nullable(T.string.whereby({ length: { max: 5 } })).weighted({
      null: 0.1,
    }),
  );

  let nul = 0;
  let value = 0;
  const n = 12000;

  for (let i = 0; i < n; i++) {
    if (built.fabricate() === null) nul++;
    else value++;
  }

  // Weights are null=0.1, value=1 (sum 1.1) — null should land near
  // 0.1/1.1 ≈ 9.1%, not 50%, and value near 1/1.1 ≈ 90.9%, not its
  // original 50% — specifying one outcome's weight moves both shares.
  expect(nul).toBeGreaterThan(n * 0.06);
  expect(nul).toBeLessThan(n * 0.13);
  expect(value).toBeGreaterThan(n * 0.87);
  expect(value).toBeLessThan(n * 0.94);
});
