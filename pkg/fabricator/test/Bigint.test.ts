import { attest, expect, test } from ".";
import { FabricatorError, initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";

test("T.bigint.whereby is inclusive at both bounds", () => {
  const { T, Fabricator } = initialize({ salt: "bigint-bounds" });

  const built = new Fabricator(
    T.bigint.whereby({ min: BigInt(3), max: BigInt(6) }),
  );

  const seen = new Set<bigint>();
  for (let i = 0; i < 5000; i++) {
    const value = built.fabricate();
    expect(value >= BigInt(3)).toBe(true);
    expect(value <= BigInt(6)).toBe(true);
    seen.add(value);
  }

  expect(seen).toEqual(new Set([BigInt(3), BigInt(4), BigInt(5), BigInt(6)]));
});

test("min defaults to the negation of max", () => {
  const { T, Fabricator } = initialize({ salt: "bigint-default-min" });

  const built = new Fabricator(T.bigint.whereby({ max: BigInt(4) }));

  const seen = new Set<bigint>();
  for (let i = 0; i < 5000; i++) {
    const value = built.fabricate();
    expect(value >= BigInt(-4)).toBe(true);
    expect(value <= BigInt(4)).toBe(true);
    seen.add(value);
  }

  expect(seen.has(BigInt(-4))).toBe(true);
  expect(seen.has(BigInt(4))).toBe(true);
});

test("exclusive bigint ends drop the excluded values", () => {
  const { T, Fabricator } = initialize({ salt: "bigint-exclusive" });
  const built = new Fabricator(
    T.bigint.whereby({
      min: { value: BigInt(3), exclusive: true },
      max: { value: BigInt(6), exclusive: true },
    }),
  );

  const seen = new Set<bigint>();
  for (let i = 0; i < 5000; i++) seen.add(built.fabricate());
  expect(seen).toEqual(new Set([BigInt(4), BigInt(5)]));
});

test("an empty bigint range throws at whereby", () => {
  const { T } = initialize({ salt: "bigint-empty" });
  expect(() => T.bigint.whereby({ min: BigInt(5), max: BigInt(4) })).toThrow(
    FabricatorError.EmptyRangeError,
  );
});

test("a single-value range always fabricates that value", () => {
  const { T, Fabricator } = initialize({ salt: "bigint-single" });

  const built = new Fabricator(
    T.bigint.whereby({ min: BigInt(9), max: BigInt(9) }),
  );

  for (let i = 0; i < 100; i++) {
    expect(built.fabricate()).toBe(BigInt(9));
  }
});

/**
 * A large range exercises the byte-buffer/rejection-sampling machinery
 * (`bigint/Fabricator.ts`) beyond what fits a single `Uint8Array` byte, still
 * staying reproducible and in range.
 */
test("a range spanning multiple bytes stays within bounds", () => {
  const { T, Fabricator } = initialize({ salt: "bigint-multibyte" });

  const min = BigInt(0);
  const max = BigInt("340282366920938463463374607431768211455"); // 2^128 - 1
  const built = new Fabricator(T.bigint.whereby({ min, max }));

  for (let i = 0; i < 2000; i++) {
    const value = built.fabricate();
    expect(value >= min).toBe(true);
    expect(value <= max).toBe(true);
  }
});

/** Every value returned is a genuine `bigint`, never a `number`. */
test("fabricated values are bigints", () => {
  const { T, Fabricator } = initialize({ salt: "bigint-typeof" });

  const built = new Fabricator(
    T.bigint.whereby({ min: BigInt(0), max: BigInt(1000) }),
  );

  for (let i = 0; i < 50; i++) {
    expect(typeof built.fabricate()).toBe("bigint");
  }
});

test("a number bound converts and draws as its bigint twin", () => {
  const left = initialize({ salt: "bigint-number", clock: "derived" });
  const right = initialize({ salt: "bigint-number", clock: "derived" });

  const numbers = new left.Fabricator(
    left.T.bigint.whereby({ min: -3, max: { value: 9, exclusive: true } }),
  );
  const bigints = new right.Fabricator(
    right.T.bigint.whereby({
      min: BigInt(-3),
      max: { value: BigInt(9), exclusive: true },
    }),
  );

  expect(Array.from({ length: 50 }, () => numbers.fabricate())).toEqual(
    Array.from({ length: 50 }, () => bigints.fabricate()),
  );
  expect(left.T.bigint.whereby({ min: 0, max: 5 })[Meta].whereby).toEqual({
    min: { value: BigInt(0), exclusive: false },
    max: { value: BigInt(5), exclusive: false },
  });
});

test("a number bound that is not a safe integer throws at whereby", () => {
  const { T } = initialize({ salt: "bigint-number-invalid" });

  for (const value of [5.5, 2 ** 60, Number.NaN, Infinity]) {
    const error = attest.throws(FabricatorError.InvalidBoundError, () =>
      T.bigint.whereby({ max: value }),
    );
    expect(error.end).toBe("max");
    expect(error.label).toBe("T.bigint.whereby");
  }
  expect(() => T.unique.bigint.whereby({ min: 0.5, max: 3 })).toThrow(
    FabricatorError.InvalidBoundError,
  );
});
