import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import {
  defaultAlgorithm,
  toStream,
  weighted,
} from "@ghostry/fabricator/internal";

/**
 * `weighted()` (`Distribution/index.ts`) directly, against a raw stream: the
 * equal-weight path and the alias-table path must each respect the weights and
 * replay exactly from the same seed. Frequencies are deterministic per seed, so
 * the tolerances below cannot flake; widen the sample before suspecting the
 * implementation if one ever trips.
 */

function frequencies(
  weights: ReadonlyArray<number>,
  seed: string,
  draws: number,
): number[] {
  const pick = weighted(
    weights.map((weight, i) => [weight, i] as const),
    toStream(defaultAlgorithm, seed),
    "test",
  );
  const counts = weights.map(() => 0);
  for (let i = 0; i < draws; i++) counts[pick()]!++;
  return counts.map((count) => count / draws);
}

function expectRespects(weights: ReadonlyArray<number>, seed: string): void {
  const draws = 200_000;
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const observed = frequencies(weights, seed, draws);

  weights.forEach((weight, i) => {
    const expected = weight / sum;
    if (weight === 0) {
      expect(observed[i]).toBe(0);
      return;
    }
    /** Five binomial standard deviations. */
    const tolerance = 5 * Math.sqrt((expected * (1 - expected)) / draws);
    expect(Math.abs(observed[i]! - expected)).toBeLessThan(tolerance);
  });
}

test("a skewed table with a zero weight is respected", () => {
  expectRespects([1, 2, 3, 0, 10], "weighted-skewed");
});

test("a large random table is respected", () => {
  const stream = toStream(defaultAlgorithm, "weighted-large-weights");
  const weights = Array.from({ length: 300 }, () => stream.next() * 10 + 0.01);
  expectRespects(weights, "weighted-large");
});

test("equal weights other than 1 draw uniformly", () => {
  expectRespects([2, 2, 2, 2, 2, 2, 2], "weighted-equal");
});

test("a single drawable entry is always chosen", () => {
  expect(frequencies([0, 4, 0], "weighted-single", 1_000)).toEqual([0, 1, 0]);
});

test("both paths replay exactly from the same seed", () => {
  for (const weights of [
    [1, 1, 1, 1],
    [1, 5, 0, 2.5],
  ]) {
    const run = () => {
      const pick = weighted(
        weights.map((weight, i) => [weight, i] as const),
        toStream(defaultAlgorithm, "weighted-replay"),
        "test",
      );
      return Array.from({ length: 1_000 }, pick);
    };
    expect(run()).toEqual(run());
  }
});

test("large enums fabricate members of their set", () => {
  const { T, Fabricator } = initialize({ salt: "weighted-large-enum" });
  const members = Array.from({ length: 100_000 }, (_, i) => i);

  const uniform = new Fabricator(T.enum.uniform(members));
  const skewed = new Fabricator(
    T.enum.weighted(members.map((member) => [(member % 17) + 1, member])),
  );

  for (let i = 0; i < 10_000; i++) {
    const a = uniform.fabricate();
    const b = skewed.fabricate();
    expect(Number.isInteger(a) && a >= 0 && a < members.length).toBe(true);
    expect(Number.isInteger(b) && b >= 0 && b < members.length).toBe(true);
  }
});
