import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("a nullish field's key is always present, its value sometimes null or undefined", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-value" });

  const built = new Fabricator(
    T.object({ a: T.nullish(T.string.whereby({ length: { max: 5 } })) }),
  );

  let sawValue = false;
  let sawNull = false;
  let sawUndefined = false;

  for (let i = 0; i < 300 && !(sawValue && sawNull && sawUndefined); i++) {
    const result = built.fabricate();
    expect("a" in result).toBe(true);
    if (result.a === null) sawNull = true;
    else if (result.a === undefined) sawUndefined = true;
    else {
      sawValue = true;
      expect(typeof result.a).toBe("string");
    }
  }

  expect(sawValue).toBe(true);
  expect(sawNull).toBe(true);
  expect(sawUndefined).toBe(true);
});

test("a nullish field's roll is a uniform 1/3 split, not the 50/25/25 that composing nullable+undefinable would give", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-distribution" });

  const built = new Fabricator(
    T.object({ a: T.nullish(T.string.whereby({ length: { max: 5 } })) }),
  );

  let nul = 0;
  let undef = 0;
  let value = 0;
  const n = 6000;

  for (let i = 0; i < n; i++) {
    const result = built.fabricate();
    if (result.a === null) nul++;
    else if (result.a === undefined) undef++;
    else value++;
  }

  // Generous tolerance around 1/3 (2000 of 6000) — this is a statistical
  // check, not an exact one, but a 50/25/25 split would miss by ~1000,
  // far outside this band.
  expect(nul).toBeGreaterThan(1800);
  expect(nul).toBeLessThan(2200);
  expect(undef).toBeGreaterThan(1800);
  expect(undef).toBeLessThan(2200);
  expect(value).toBeGreaterThan(1800);
  expect(value).toBeLessThan(2200);
});

test("a nullish field's roll never disturbs its object's other randomness", () => {
  const salt = "nullish-no-disturb";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    salt,
    clock: "derived",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    salt,
    clock: "derived",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withNullish = new Fabricator2(
    T2.object({
      a: T2.nullish(T2.string.whereby({ length: { max: 5 } })),
      b: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withNullish.fabricate().b).toBe(plain.fabricate().b);
  }
});

test("unlike T.optional, T.nullish builds and fabricates standalone, outside any object", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-standalone" });

  const built = new Fabricator(T.string.whereby({ length: { max: 5 } }));
  const nullishBuilt = new Fabricator(
    T.nullish(T.string.whereby({ length: { max: 5 } })),
  );

  const result = nullishBuilt.fabricate();
  expect(
    result === null || result === undefined || typeof result === "string",
  ).toBe(true);
  expect(typeof built.fabricate()).toBe("string");
});

test(".override({ key: value }) forces a nullish field to that value", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-override-value" });

  const schema = T.object({
    a: T.nullish(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: "forced" });

  expect(new Fabricator(schema).fabricate().a).toBe("forced");
});

test(".override({ key: null }) forces a nullish field to null", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-override-null" });

  const schema = T.object({
    a: T.nullish(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: null });

  const result = new Fabricator(schema).fabricate();
  expect(result.a).toBeNull();
});

test(".override({ key: undefined }) forces a nullish field to undefined", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-override-undefined" });

  const schema = T.object({
    a: T.nullish(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: undefined });

  const result = new Fabricator(schema).fabricate();
  expect("a" in result).toBe(true);
  expect(result.a).toBeUndefined();
});

test("an override value that violates a nullish field's inner kind throws", () => {
  const { T } = initialize({ salt: "nullish-kind-violation" });

  const schema = T.object({
    a: T.nullish(T.string.whereby({ length: { max: 5 } })),
  });

  expect(() => schema.override({ a: 5 as unknown as string })).toThrow();
});

test(".as(...) replaces the three-way roll with an opaque producer, which may itself return null or undefined", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-as" });

  const alwaysValue = new Fabricator(
    T.object({
      a: T.nullish(T.string.whereby({ length: { max: 5 } })).as(() => "fixed"),
    }),
  );
  expect(alwaysValue.fabricate()).toEqual({ a: "fixed" });

  const alwaysNull = new Fabricator(
    T.object({
      a: T.nullish(T.string.whereby({ length: { max: 5 } })).as(() => null),
    }),
  );
  expect(alwaysNull.fabricate()).toEqual({ a: null });

  const alwaysUndefined = new Fabricator(
    T.object({
      a: T.nullish(T.string.whereby({ length: { max: 5 } })).as(
        () => undefined,
      ),
    }),
  );
  expect(alwaysUndefined.fabricate()).toEqual({ a: undefined });
});

test("a nullish field nested in an array of objects resolves independently per element", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-in-array" });

  const built = new Fabricator(
    T.array(
      T.object({ a: T.nullish(T.string.whereby({ length: { max: 5 } })) }),
    ).whereby({ length: { min: 40, max: 60 } }),
  );

  const results = built.fabricate();
  const outcomes = new Set(
    results.map((r) =>
      r.a === null ? "null" : r.a === undefined ? "undefined" : "value",
    ),
  );

  expect(outcomes.has("null")).toBe(true);
  expect(outcomes.has("undefined")).toBe(true);
  expect(outcomes.has("value")).toBe(true);
});

test(".weighted(...) reweights relative to a fixed baseline of 1 for unspecified outcomes, shifting every outcome's share, not just the one named", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-weighted" });

  const built = new Fabricator(
    T.nullish(T.string.whereby({ length: { max: 5 } })).weighted({ null: 0.1 }),
  );

  let nul = 0;
  let undef = 0;
  let value = 0;
  const n = 12000;

  for (let i = 0; i < n; i++) {
    const result = built.fabricate();
    if (result === null) nul++;
    else if (result === undefined) undef++;
    else value++;
  }

  // Weights are null=0.1, undefined=1, value=1 (sum 2.1) — null should
  // land near 0.1/2.1 ≈ 4.8%, not 33%, and the two untouched outcomes
  // should land near 1/2.1 ≈ 47.6% each, not their original 33%.
  expect(nul).toBeGreaterThan(n * 0.03);
  expect(nul).toBeLessThan(n * 0.07);
  expect(undef).toBeGreaterThan(n * 0.42);
  expect(undef).toBeLessThan(n * 0.53);
  expect(value).toBeGreaterThan(n * 0.42);
  expect(value).toBeLessThan(n * 0.53);
});

test("chained .weighted(...) calls merge into previous weights rather than replacing them wholesale", () => {
  const { T, Fabricator } = initialize({ salt: "nullish-weighted-chain" });

  const built = new Fabricator(
    T.nullish(T.string.whereby({ length: { max: 5 } }))
      .weighted({ null: 10 })
      .weighted({ undefined: 10 }),
  );

  let nul = 0;
  let undef = 0;
  let value = 0;
  const n = 12000;

  for (let i = 0; i < n; i++) {
    const result = built.fabricate();
    if (result === null) nul++;
    else if (result === undefined) undef++;
    else value++;
  }

  // Weights end up null=10, undefined=10, value=1 (sum 21) if both calls'
  // weights survived — if the second call had wholesale-replaced the
  // first instead of merging, null would fall back to the default weight
  // of 1 and land near 1/11 ≈ 9%, well outside this band.
  expect(nul).toBeGreaterThan(n * 0.4);
  expect(undef).toBeGreaterThan(n * 0.4);
  expect(value).toBeLessThan(n * 0.1);
});
