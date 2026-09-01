import { expect, test } from "bun:test";
import { Omitted, initialize } from "@ghostry/fabricator";

test("an omittable field's key is genuinely omitted on the roll that comes up empty, not present-as-undefined", () => {
  const { T, Fabricator } = initialize({ salt: "omittable-omission" });

  const built = new Fabricator(
    T.object({ a: T.omittable(T.string.whereby({ length: { max: 5 } })) }),
  );

  let sawPresent = false;
  let sawOmitted = false;

  for (let i = 0; i < 100 && !(sawPresent && sawOmitted); i++) {
    const result = built.fabricate();
    if ("a" in result) {
      sawPresent = true;
      expect(typeof result.a).toBe("string");
    } else {
      sawOmitted = true;
      expect(Object.keys(result)).not.toContain("a");
    }
  }

  expect(sawPresent).toBe(true);
  expect(sawOmitted).toBe(true);
});

test("an omittable field's presence roll never disturbs its object's other randomness", () => {
  const salt = "omittable-no-disturb";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    salt,
    clock: "derived",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    salt,
    clock: "derived",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withOmittable = new Fabricator2(
    T2.object({
      a: T2.omittable(T2.string.whereby({ length: { max: 5 } })),
      b: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withOmittable.fabricate().b).toBe(plain.fabricate().b);
  }
});

test(".override({ key: Omitted }) bakes the field omitted into the schema", () => {
  const { T, Fabricator } = initialize({ salt: "omittable-override-omitted" });

  const schema = T.object({
    a: T.omittable(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: Omitted });

  const result = new Fabricator(schema).fabricate();

  expect("a" in result).toBe(false);
});

test(".override({ key: value }) forces an omittable field present with that value", () => {
  const { T, Fabricator } = initialize({ salt: "omittable-override-present" });

  const schema = T.object({
    a: T.omittable(T.string.whereby({ length: { max: 5 } })),
  }).override({ a: "forced" });

  const result = new Fabricator(schema).fabricate();

  expect(result.a).toBe("forced");
});

test("fabricate({ key: Omitted }) forces an omittable field omitted for that call only", () => {
  const { T, Fabricator } = initialize({ salt: "omittable-fabricate-omitted" });

  const built = new Fabricator(
    T.object({ a: T.omittable(T.string.whereby({ length: { max: 5 } })) }),
  );

  const forced = built.fabricate({ a: Omitted });
  expect("a" in forced).toBe(false);

  // Not baked into the Fabricator — the next call rolls again normally.
  let sawPresentAgain = false;
  for (let i = 0; i < 50 && !sawPresentAgain; i++) {
    if ("a" in built.fabricate()) sawPresentAgain = true;
  }
  expect(sawPresentAgain).toBe(true);
});

test("Omitted against a non-omittable field throws, both via .override() and .fabricate(overrides)", () => {
  const { T, Fabricator } = initialize({
    salt: "omittable-omitted-non-omittable",
  });

  const schema = T.object({ b: T.number });

  expect(() => schema.override({ b: Omitted as unknown as number })).toThrow();

  const built = new Fabricator(schema);
  expect(() => built.fabricate({ b: Omitted as unknown as number })).toThrow();
});

test("an override value that violates an omittable field's inner kind throws", () => {
  const { T } = initialize({ salt: "omittable-kind-violation" });

  const schema = T.object({
    a: T.omittable(T.string.whereby({ length: { max: 5 } })),
  });

  expect(() => schema.override({ a: 5 as unknown as string })).toThrow();
});

test(".as(...) replaces the presence roll with an opaque producer, which may itself return Omitted", () => {
  const { T, Fabricator } = initialize({ salt: "omittable-as" });

  const alwaysPresent = new Fabricator(
    T.object({
      a: T.omittable(T.string.whereby({ length: { max: 5 } })).as(
        () => "fixed",
      ),
    }),
  );
  expect(alwaysPresent.fabricate()).toEqual({ a: "fixed" });
  expect(alwaysPresent.fabricate()).toEqual({ a: "fixed" });

  const alwaysOmitted = new Fabricator(
    T.object({
      a: T.omittable(T.string.whereby({ length: { max: 5 } })).as(
        () => Omitted,
      ),
    }),
  );
  expect("a" in alwaysOmitted.fabricate()).toBe(false);
  expect("a" in alwaysOmitted.fabricate()).toBe(false);
});

test("an omittable field nested in an array of objects resolves independently per element", () => {
  const { T, Fabricator } = initialize({ salt: "omittable-in-array" });

  const built = new Fabricator(
    T.array(
      T.object({ a: T.omittable(T.string.whereby({ length: { max: 5 } })) }),
    ).whereby({ length: { min: 20, max: 30 } }),
  );

  const results = built.fabricate();
  const presences = new Set(results.map((r) => "a" in r));

  expect(presences.has(true)).toBe(true);
  expect(presences.has(false)).toBe(true);
});

test(".weighted(...) reweights relative to a fixed baseline of 1 for the unspecified outcome", () => {
  const { T, Fabricator } = initialize({ salt: "omittable-weighted" });

  const built = new Fabricator(
    T.object({
      a: T.omittable(T.string.whereby({ length: { max: 5 } })).weighted({
        omitted: 0.1,
      }),
    }),
  );

  let omitted = 0;
  let present = 0;
  const n = 12000;

  for (let i = 0; i < n; i++) {
    if ("a" in built.fabricate()) present++;
    else omitted++;
  }

  // Weights are omitted=0.1, value=1 (sum 1.1) — omitted should land near
  // 0.1/1.1 ≈ 9.1%, not 50%, and present near 1/1.1 ≈ 90.9%, not its
  // original 50% — specifying one outcome's weight moves both shares.
  expect(omitted).toBeGreaterThan(n * 0.06);
  expect(omitted).toBeLessThan(n * 0.13);
  expect(present).toBeGreaterThan(n * 0.87);
  expect(present).toBeLessThan(n * 0.94);
});
