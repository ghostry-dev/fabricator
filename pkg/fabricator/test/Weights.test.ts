import { expect, test } from "bun:test";
import { FabricatorError, initialize } from "@ghostry/fabricator";

/**
 * `.weighted(...)` construction and fabricate-time filtering. Shared
 * guards live in `Distribution/index.ts`; these cover the wiring per
 * kind rather than re-testing the predicates themselves — `NaN`,
 * `Infinity`, and the explicit-`undefined` passthrough are exercised
 * once each on whichever kind reaches the same shared body.
 */

test("an explicitly-undefined weight means unspecified and is allowed", () => {
  const { T, Fabricator } = initialize({ seed: "weights-undefined-key" });

  const built = new Fabricator(
    T.nullable(T.always("v")).weighted({ null: 2, value: undefined }),
  );

  const seen = new Set<unknown>();
  for (let i = 0; i < 200 && seen.size < 2; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set([null, "v"]));
});

test("a valid fractional weight still constructs and reweights", () => {
  const { T, Fabricator } = initialize({ seed: "weights-fractional" });

  const built = new Fabricator(
    T.nullable(T.always("v")).weighted({ null: 0.1 }),
  );

  const seen = new Set<unknown>();
  for (let i = 0; i < 500 && seen.size < 2; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set([null, "v"]));
});

test("T.boolean.weighted({ true: 0 }) is always false", () => {
  const { T, Fabricator } = initialize({ seed: "weights-boolean-zero-true" });
  const built = new Fabricator(T.boolean.weighted({ true: 0 }));

  for (let i = 0; i < 50; i++) expect(built.fabricate()).toBe(false);
});

test("T.nullable.weighted({ null: 0 }) is always the inner value", () => {
  const { T, Fabricator } = initialize({ seed: "weights-nullable-zero-null" });
  const built = new Fabricator(T.nullable(T.always("v")).weighted({ null: 0 }));

  for (let i = 0; i < 50; i++) expect(built.fabricate()).toBe("v");
});

test("T.undefinable.weighted({ undefined: 0 }) is always the inner value", () => {
  const { T, Fabricator } = initialize({
    seed: "weights-undefinable-zero-undefined",
  });
  const built = new Fabricator(
    T.undefinable(T.always("v")).weighted({ undefined: 0 }),
  );

  for (let i = 0; i < 50; i++) expect(built.fabricate()).toBe("v");
});

test("T.nullish.weighted({ null: 0 }) never yields null", () => {
  const { T, Fabricator } = initialize({ seed: "weights-nullish-zero-null" });
  const built = new Fabricator(T.nullish(T.always("v")).weighted({ null: 0 }));

  const seen = new Set<unknown>();
  for (let i = 0; i < 200; i++) seen.add(built.fabricate());

  expect(seen.has(null)).toBe(false);
  expect(seen.has(undefined)).toBe(true);
  expect(seen.has("v")).toBe(true);
});

test("T.omittable.weighted({ omitted: 0 }) always writes the key", () => {
  const { T, Fabricator } = initialize({ seed: "weights-omittable-zero" });
  const built = new Fabricator(
    T.object({ a: T.omittable(T.always("v")).weighted({ omitted: 0 }) }),
  );

  for (let i = 0; i < 50; i++) expect(built.fabricate()).toEqual({ a: "v" });
});

test("T.optional.weighted({ omitted: 0 }) never omits the key", () => {
  const { T, Fabricator } = initialize({ seed: "weights-optional-zero" });
  const built = new Fabricator(
    T.object({ a: T.optional(T.always("v")).weighted({ omitted: 0 }) }),
  );

  const seenUndefined = { present: false };
  const seenValue = { present: false };

  for (let i = 0; i < 200; i++) {
    const value = built.fabricate();
    expect("a" in value).toBe(true);
    if (value.a === undefined) seenUndefined.present = true;
    if (value.a === "v") seenValue.present = true;
  }

  expect(seenUndefined.present).toBe(true);
  expect(seenValue.present).toBe(true);
});

test("T.enum.weighted with a zeroed member never draws it", () => {
  const { T, Fabricator } = initialize({ seed: "weights-enum-zero" });
  const built = new Fabricator(
    T.enum.weighted([
      [0, "a"],
      [1, "b"],
    ]),
  );

  for (let i = 0; i < 50; i++) expect(built.fabricate()).toBe("b");
});

test("T.choice.weighted with a zeroed option never fabricates it", () => {
  const { T, Fabricator } = initialize({ seed: "weights-choice-zero" });
  const built = new Fabricator(
    T.choice.weighted([
      [0, T.always("a")],
      [1, T.always("b")],
    ]),
  );

  for (let i = 0; i < 50; i++) expect(built.fabricate()).toBe("b");
});

test("all-zero weights throw NoDrawableOutcomesError, per kind", () => {
  const { T } = initialize({ seed: "weights-all-zero" });

  expect(() => T.boolean.weighted({ true: 0, false: 0 })).toThrow(
    FabricatorError.NoDrawableOutcomesError,
  );
  expect(() =>
    T.nullable(T.always("v")).weighted({ null: 0, value: 0 }),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
  expect(() =>
    T.undefinable(T.always("v")).weighted({ undefined: 0, value: 0 }),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
  expect(() =>
    T.nullish(T.always("v")).weighted({ null: 0, undefined: 0, value: 0 }),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
  expect(() =>
    T.omittable(T.always("v")).weighted({ omitted: 0, value: 0 }),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
  expect(() =>
    T.optional(T.always("v")).weighted({ omitted: 0, undefined: 0, value: 0 }),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
  expect(() =>
    T.enum.weighted([
      [0, "a"],
      [0, "b"],
    ]),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
  expect(() =>
    T.choice.weighted([
      [0, T.always("a")],
      [0, T.always("b")],
    ]),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
});

test("accumulation across two .weighted() calls throws when the merge is all-zero", () => {
  const { T } = initialize({ seed: "weights-accumulate-all-zero" });

  expect(() => T.boolean.weighted({ true: 0 }).weighted({ false: 0 })).toThrow(
    FabricatorError.NoDrawableOutcomesError,
  );
});

test("a negative weight still throws InvalidWeightError", () => {
  const { T } = initialize({ seed: "weights-negative" });

  expect(() => T.boolean.weighted({ false: -1 })).toThrow(
    FabricatorError.InvalidWeightError,
  );
});

/**
 * `NaN` fails every ordering comparison, so a `weight <= 0` rejection
 * check would let it through while `weighted()`'s own `weight > 0`
 * filter still drops it — the reason validity uses `isValidWeight`
 * (`NaN >= 0` is false) rather than an independent `<= 0`.
 */
test("a NaN weight is rejected, not silently dropped", () => {
  const { T } = initialize({ seed: "weights-nan" });

  expect(() => T.boolean.weighted({ true: NaN })).toThrow(
    FabricatorError.InvalidWeightError,
  );
});

test("an Infinity weight throws InvalidWeightError at construction", () => {
  const { T } = initialize({ seed: "weights-infinity" });

  expect(() => T.boolean.weighted({ true: Infinity })).toThrow(
    FabricatorError.InvalidWeightError,
  );
});

test("Distribution.multi with all-zero components throws a FabricatorError", () => {
  const { T, Fabricator } = initialize({ seed: "weights-multi-all-zero" });

  expect(
    () =>
      new Fabricator(
        T.number.whereby({
          min: 0,
          max: 1,
          distribution: {
            kind: "multi",
            components: [
              { weight: 0, distribution: { kind: "uniform" } },
              { weight: 0, distribution: { kind: "uniform" } },
            ],
          },
        }),
      ),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
});

test("a string composition with every class zeroed throws a FabricatorError", () => {
  const { T, Fabricator } = initialize({
    seed: "weights-composition-all-zero",
  });

  expect(
    () =>
      new Fabricator(
        T.string.whereby({
          length: { max: 5 },
          composition: { digit: 0, lowercase: 0 },
        }),
      ),
  ).toThrow(FabricatorError.NoDrawableOutcomesError);
});
