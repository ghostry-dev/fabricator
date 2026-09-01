import { expect, test } from "bun:test";
import { Omitted, initialize } from "@ghostry/fabricator";

test("an optional field's roll lands on all three outcomes: omitted, present-as-undefined, present-with-a-value", () => {
  const { T, Fabricator } = initialize({ salt: "optional-three-outcomes" });

  const built = new Fabricator(
    T.object({ a: T.optional(T.string.whereby({ length: { max: 5 } })) }),
  );

  let sawOmitted = false;
  let sawUndefined = false;
  let sawValue = false;

  for (let i = 0; i < 300 && !(sawOmitted && sawUndefined && sawValue); i++) {
    const result = built.fabricate();
    if (!("a" in result)) {
      sawOmitted = true;
    } else if (result.a === undefined) {
      sawUndefined = true;
    } else {
      sawValue = true;
      expect(typeof result.a).toBe("string");
    }
  }

  expect(sawOmitted).toBe(true);
  expect(sawUndefined).toBe(true);
  expect(sawValue).toBe(true);
});

test("an optional field's roll is a uniform 1/3 split, not the 50/25/25 that composing omittable+undefinable would give", () => {
  const { T, Fabricator } = initialize({ salt: "optional-distribution" });

  const built = new Fabricator(
    T.object({ a: T.optional(T.string.whereby({ length: { max: 5 } })) }),
  );

  let omitted = 0;
  let undef = 0;
  let value = 0;
  const n = 6000;

  for (let i = 0; i < n; i++) {
    const result = built.fabricate();
    if (!("a" in result)) omitted++;
    else if (result.a === undefined) undef++;
    else value++;
  }

  // Generous tolerance around 1/3 (2000 of 6000) — this is a statistical
  // check, not an exact one, but a 50/25/25 split would miss by ~1000,
  // far outside this band.
  expect(omitted).toBeGreaterThan(1800);
  expect(omitted).toBeLessThan(2200);
  expect(undef).toBeGreaterThan(1800);
  expect(undef).toBeLessThan(2200);
  expect(value).toBeGreaterThan(1800);
  expect(value).toBeLessThan(2200);
});

test("an optional field's roll never disturbs its object's other randomness", () => {
  const salt = "optional-no-disturb";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    salt,
    clock: "derived",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    salt,
    clock: "derived",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withOptional = new Fabricator2(
    T2.object({
      a: T2.optional(T2.string.whereby({ length: { max: 5 } })),
      b: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withOptional.fabricate().b).toBe(plain.fabricate().b);
  }
});

test(".override({ key: Omitted }) bakes the field omitted into the schema", () => {
  const { T, Fabricator } = initialize({ salt: "optional-override-omitted" });

  const schema = T.object({
    a: T.optional(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: Omitted });

  const result = new Fabricator(schema).fabricate();

  expect("a" in result).toBe(false);
});

test(".override({ key: undefined }) bakes the field present-as-undefined into the schema", () => {
  const { T, Fabricator } = initialize({ salt: "optional-override-undefined" });

  const schema = T.object({
    a: T.optional(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: undefined });

  const result = new Fabricator(schema).fabricate();

  expect("a" in result).toBe(true);
  expect(result.a).toBeUndefined();
});

test(".override({ key: value }) forces an optional field present with that value", () => {
  const { T, Fabricator } = initialize({ salt: "optional-override-present" });

  const schema = T.object({
    a: T.optional(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: "forced" });

  const result = new Fabricator(schema).fabricate();

  expect(result.a).toBe("forced");
});

test("fabricate({ key: Omitted }) and fabricate({ key: undefined }) force an optional field for that call only", () => {
  const { T, Fabricator } = initialize({ salt: "optional-fabricate-forced" });

  const built = new Fabricator(
    T.object({ a: T.optional(T.string.whereby({ length: { max: 5 } })) }),
  );

  const forcedOmitted = built.fabricate({ a: Omitted });
  expect("a" in forcedOmitted).toBe(false);

  const forcedUndefined = built.fabricate({ a: undefined });
  expect("a" in forcedUndefined).toBe(true);
  expect(forcedUndefined.a).toBeUndefined();

  // Not baked into the Fabricator — later calls roll again normally.
  let sawValueAgain = false;
  for (let i = 0; i < 100 && !sawValueAgain; i++) {
    const result = built.fabricate();
    if ("a" in result && result.a !== undefined) sawValueAgain = true;
  }
  expect(sawValueAgain).toBe(true);
});

test("Omitted against a field that is neither omittable nor optional throws, both via .override() and .fabricate(overrides)", () => {
  const { T, Fabricator } = initialize({
    salt: "optional-omitted-non-optional",
  });

  const schema = T.object({ b: T.number });

  expect(() => schema.override({ b: Omitted as unknown as number })).toThrow();

  const built = new Fabricator(schema);
  expect(() => built.fabricate({ b: Omitted as unknown as number })).toThrow();
});

test("an override value that violates an optional field's inner kind throws", () => {
  const { T } = initialize({ salt: "optional-kind-violation" });

  const schema = T.object({
    a: T.optional(T.string.whereby({ length: { max: 5 } })),
  });

  expect(() => schema.override({ a: 5 as unknown as string })).toThrow();
});

test(".as(...) replaces the three-way roll with an opaque producer, which may itself return undefined or Omitted", () => {
  const { T, Fabricator } = initialize({ salt: "optional-as" });

  const alwaysValue = new Fabricator(
    T.object({
      a: T.optional(T.string.whereby({ length: { max: 5 } })).as(() => "fixed"),
    }),
  );
  expect(alwaysValue.fabricate()).toEqual({ a: "fixed" });
  expect(alwaysValue.fabricate()).toEqual({ a: "fixed" });

  const alwaysUndefined = new Fabricator(
    T.object({
      a: T.optional(T.string.whereby({ length: { max: 5 } })).as(
        () => undefined,
      ),
    }),
  );
  expect(alwaysUndefined.fabricate()).toEqual({ a: undefined });

  const alwaysOmitted = new Fabricator(
    T.object({
      a: T.optional(T.string.whereby({ length: { max: 5 } })).as(() => Omitted),
    }),
  );
  expect("a" in alwaysOmitted.fabricate()).toBe(false);
});

test("an optional field nested in an array of objects resolves independently per element", () => {
  const { T, Fabricator } = initialize({ salt: "optional-in-array" });

  const built = new Fabricator(
    T.array(
      T.object({ a: T.optional(T.string.whereby({ length: { max: 5 } })) }),
    ).whereby({ length: { min: 40, max: 60 } }),
  );

  const results = built.fabricate();
  const outcomes = new Set(
    results.map((r) =>
      !("a" in r) ? "omitted" : r.a === undefined ? "undefined" : "value",
    ),
  );

  expect(outcomes.has("omitted")).toBe(true);
  expect(outcomes.has("undefined")).toBe(true);
  expect(outcomes.has("value")).toBe(true);
});

test(".weighted(...) reweights relative to a fixed baseline of 1 for unspecified outcomes, shifting every outcome's share, not just the one named", () => {
  const { T, Fabricator } = initialize({ salt: "optional-weighted" });

  const built = new Fabricator(
    T.object({
      a: T.optional(T.string.whereby({ length: { max: 5 } })).weighted({
        omitted: 0.1,
      }),
    }),
  );

  let omitted = 0;
  let undef = 0;
  let value = 0;
  const n = 12000;

  for (let i = 0; i < n; i++) {
    const result = built.fabricate();
    if (!("a" in result)) omitted++;
    else if (result.a === undefined) undef++;
    else value++;
  }

  // Weights are omitted=0.1, undefined=1, value=1 (sum 2.1) — omitted
  // should land near 0.1/2.1 ≈ 4.8%, not 33%, and the two untouched
  // outcomes should land near 1/2.1 ≈ 47.6% each, not their original 33%
  // — specifying one outcome's weight moves everyone's resulting share.
  expect(omitted).toBeGreaterThan(n * 0.03);
  expect(omitted).toBeLessThan(n * 0.07);
  expect(undef).toBeGreaterThan(n * 0.42);
  expect(undef).toBeLessThan(n * 0.53);
  expect(value).toBeGreaterThan(n * 0.42);
  expect(value).toBeLessThan(n * 0.53);
});

test("chained .weighted(...) calls merge into previous weights rather than replacing them wholesale", () => {
  const { T, Fabricator } = initialize({ salt: "optional-weighted-chain" });

  const built = new Fabricator(
    T.object({
      a: T.optional(T.string.whereby({ length: { max: 5 } }))
        .weighted({ omitted: 10 })
        .weighted({ undefined: 10 }),
    }),
  );

  let omitted = 0;
  let undef = 0;
  let value = 0;
  const n = 12000;

  for (let i = 0; i < n; i++) {
    const result = built.fabricate();
    if (!("a" in result)) omitted++;
    else if (result.a === undefined) undef++;
    else value++;
  }

  // Weights end up omitted=10, undefined=10, value=1 (sum 21) if both
  // calls' weights survived — if the second call had wholesale-replaced
  // the first instead of merging, omitted would fall back to the default
  // weight of 1 and land near 1/11 ≈ 9%, well outside this band.
  expect(omitted).toBeGreaterThan(n * 0.4);
  expect(undef).toBeGreaterThan(n * 0.4);
  expect(value).toBeLessThan(n * 0.1);
});
