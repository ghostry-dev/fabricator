import { expect, test } from "bun:test";
import { FabricatorError, initialize } from "@ghostry/fabricator";

/**
 * `T.number.integer` without a `whereby` must still be whole: it uses the
 * same discrete floor path as a bounded integer (`test/Integer.test.ts`).
 */

test("an unbounded T.number.integer really is an integer", () => {
  const { T, Fabricator } = initialize({ seed: "integer-unbounded" });

  const built = new Fabricator(T.number.integer);

  for (let i = 0; i < 5000; i++) {
    const value = built.fabricate();
    expect(Number.isInteger(value)).toBe(true);
    expect(Number.isSafeInteger(value)).toBe(true);
  }
});

/** Both signs still occur. */
test("an unbounded T.number.integer spans both signs", () => {
  const { T, Fabricator } = initialize({ seed: "integer-signs" });

  const built = new Fabricator(T.number.integer);

  let negative = 0;
  let positive = 0;
  for (let i = 0; i < 2000; i++) {
    if (built.fabricate() < 0) negative++;
    else positive++;
  }

  expect(negative).toBeGreaterThan(0);
  expect(positive).toBeGreaterThan(0);
});

test("a bounded T.number.integer stays integral and in range", () => {
  const { T, Fabricator } = initialize({ seed: "integer-bounded" });

  const built = new Fabricator(T.number.integer.whereby({ min: 0, max: 10 }));

  const seen = new Set<number>();
  for (let i = 0; i < 5000; i++) {
    const value = built.fabricate();
    expect(Number.isInteger(value)).toBe(true);
    seen.add(value);
  }

  /** Both endpoints reachable, nothing outside them. */
  for (const value of seen) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(10);
  }
  expect(seen.has(0)).toBe(true);
  expect(seen.has(10)).toBe(true);
});

test("exclusive integer ends drop the excluded integers", () => {
  const { T, Fabricator } = initialize({ seed: "integer-exclusive" });
  const built = new Fabricator(
    T.number.integer.whereby({
      min: { value: 0, exclusive: true },
      max: { value: 5, exclusive: true },
    }),
  );

  const seen = new Set<number>();
  for (let i = 0; i < 5000; i++) seen.add(built.fabricate());
  expect(seen).toEqual(new Set([1, 2, 3, 4]));
});

test("an empty integer range throws at whereby", () => {
  const { T } = initialize({ seed: "integer-empty" });
  expect(() =>
    T.number.integer.whereby({
      min: { value: 3, exclusive: true },
      max: { value: 4, exclusive: true },
    }),
  ).toThrow(FabricatorError.EmptyRangeError);
});

test("integer.sequence is unaffected", () => {
  const { T, Fabricator } = initialize({ seed: "integer-sequence" });

  const built = new Fabricator(T.number.integer.sequence);

  expect([built.fabricate(), built.fabricate(), built.fabricate()]).toEqual([
    1, 2, 3,
  ]);
});

/**
 * The counterpart assertion: a plain `T.number` must *not* have been dragged
 * into flooring. At `Number.MAX_VALUE` scale doubles carry no fractional part
 * anyway, so integrality proves nothing there — a bounded range is what
 * actually distinguishes the two.
 */
test("a plain T.number is still fractional", () => {
  const { T, Fabricator } = initialize({ seed: "number-fractional" });

  const built = new Fabricator(T.number.whereby({ min: 0, max: 10 }));

  let fractional = 0;
  for (let i = 0; i < 1000; i++) {
    if (!Number.isInteger(built.fabricate())) fractional++;
  }

  expect(fractional).toBeGreaterThan(900);
});
