import { expect, test } from "bun:test";
import { FabricatorError, initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";

/**
 * `Distribution`'s builder functions aren't exported (see
 * `docs/about/limitations.md`), but the shape they build is a plain,
 * structurally-typed tagged object — usable without an import.
 */
const skewToward = (exponent: number) => ({ kind: "skew" as const, exponent });

test("T.number.whereby is inclusive at both bounds", () => {
  const { T, Fabricator } = initialize({ salt: "number-bounds" });

  const built = new Fabricator(T.number.whereby({ min: 0, max: 1 }));

  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 200000; i++) {
    const value = built.fabricate();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
    // A continuous draw landing exactly on an endpoint is vanishingly
    // unlikely, so approach from within an epsilon of each bound instead.
    if (value < 1e-4) sawMin = true;
    if (value > 1 - 1e-4) sawMax = true;
  }

  expect(sawMin).toBe(true);
  expect(sawMax).toBe(true);
});

test("T.number.integer.whereby reaches both endpoints exactly, and nothing outside them", () => {
  const { T, Fabricator } = initialize({ salt: "number-integer-bounds" });

  const built = new Fabricator(T.number.integer.whereby({ min: 3, max: 6 }));

  const seen = new Set<number>();
  for (let i = 0; i < 5000; i++) {
    const value = built.fabricate();
    expect(value).toBeGreaterThanOrEqual(3);
    expect(value).toBeLessThanOrEqual(6);
    seen.add(value);
  }

  expect(seen).toEqual(new Set([3, 4, 5, 6]));
});

test("a single-value integer range always fabricates that value", () => {
  const { T, Fabricator } = initialize({ salt: "number-integer-single" });

  const built = new Fabricator(T.number.integer.whereby({ min: 7, max: 7 }));

  for (let i = 0; i < 100; i++) {
    expect(built.fabricate()).toBe(7);
  }
});

/**
 * Without a `distribution`, every integer in the range is equally likely —
 * asserted as a rough uniformity check (each bucket gets a similar share), not
 * an exact one, since it's still a random draw.
 */
test("an unshaped range distributes roughly uniformly across its buckets", () => {
  const { T, Fabricator } = initialize({ salt: "number-uniform" });

  const built = new Fabricator(T.number.integer.whereby({ min: 0, max: 3 }));

  const counts = [0, 0, 0, 0];
  const draws = 20000;
  for (let i = 0; i < draws; i++) {
    const bucket = built.fabricate();
    counts[bucket] = counts[bucket]! + 1;
  }

  const expected = draws / 4;
  for (const count of counts) {
    expect(count!).toBeGreaterThan(expected * 0.7);
    expect(count!).toBeLessThan(expected * 1.3);
  }
});

/**
 * A `skew` distribution with `exponent > 1` biases the draw toward `min` —
 * asserted by comparing which half of the range gets more weight, rather than
 * pinning an exact ratio.
 */
test("a skewed distribution visibly biases the draw", () => {
  const { T, Fabricator } = initialize({ salt: "number-skewed" });

  const built = new Fabricator(
    T.number.integer.whereby({ min: 0, max: 99, distribution: skewToward(5) }),
  );

  let lowerHalf = 0;
  let upperHalf = 0;
  for (let i = 0; i < 5000; i++) {
    const value = built.fabricate();
    if (value < 50) lowerHalf++;
    else upperHalf++;
  }

  expect(lowerHalf).toBeGreaterThan(upperHalf);
});

test("whereby stores min/max as Bound, never a scalar", () => {
  const { T } = initialize({ salt: "number-bound-shape" });
  const schema = T.number.whereby({
    min: 0,
    max: { value: 1, exclusive: true },
  });

  expect(schema[Meta].whereby).toEqual({
    min: { value: 0, exclusive: false },
    max: { value: 1, exclusive: true },
  });
});

test("an exclusive continuous end is never produced", () => {
  const { T, Fabricator } = initialize({ salt: "number-exclusive" });
  const built = new Fabricator(
    T.number.whereby({
      min: { value: 0, exclusive: true },
      max: { value: 1, exclusive: true },
    }),
  );

  for (let i = 0; i < 20000; i++) {
    const value = built.fabricate();
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  }
});

test("an omitted number end is not stored", () => {
  const { T, Fabricator } = initialize({ salt: "number-one-sided" });

  expect(T.number[Meta]).toEqual({});
  expect(T.number.integer[Meta]).toEqual({ integer: true });

  const lower = T.number.whereby({ min: 0 });
  expect(lower[Meta].whereby).toEqual({
    min: { value: 0, exclusive: false },
    max: undefined,
  });
  const lowerBuilt = new Fabricator(lower);
  for (let i = 0; i < 2000; i++) {
    expect(lowerBuilt.fabricate()).toBeGreaterThanOrEqual(0);
  }

  const upper = T.number.integer.whereby({ max: 0 });
  expect(upper[Meta].whereby).toEqual({
    min: undefined,
    max: { value: 0, exclusive: false },
  });
  const upperBuilt = new Fabricator(upper);
  for (let i = 0; i < 2000; i++) {
    const value = upperBuilt.fabricate();
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeLessThanOrEqual(0);
  }
});

test("a span that overflows max - min still fabricates a finite value in range", () => {
  const { T, Fabricator } = initialize({ salt: "number-overflow-span" });

  const full = new Fabricator(T.number);
  for (let i = 0; i < 2000; i++) {
    const value = full.fabricate();
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(-Number.MAX_VALUE);
    expect(value).toBeLessThanOrEqual(Number.MAX_VALUE);
  }

  const wide = new Fabricator(
    T.number.whereby({ min: -Number.MAX_VALUE, max: Number.MAX_VALUE / 2 }),
  );
  for (let i = 0; i < 2000; i++) {
    const value = wide.fabricate();
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(-Number.MAX_VALUE);
    expect(value).toBeLessThanOrEqual(Number.MAX_VALUE / 2);
  }
});

test("an empty number range throws at whereby", () => {
  const { T } = initialize({ salt: "number-empty" });
  expect(() => T.number.whereby({ min: 5, max: 3 })).toThrow(
    FabricatorError.EmptyRangeError,
  );
  expect(() =>
    T.number.whereby({ min: 1, max: { value: 1, exclusive: true } }),
  ).toThrow(FabricatorError.EmptyRangeError);
});
