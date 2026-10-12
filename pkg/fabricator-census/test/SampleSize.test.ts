import { describe, expect, test } from "bun:test";
import { CensusError, sampleSize } from "@ghostry/fabricator-census";

function reason(
  result: ReturnType<typeof sampleSize>,
  criterion: "shape" | "proportion" | "rare",
): number {
  return result.reasons.find((r) => r.criterion === criterion)!.n;
}

describe("criteria", () => {
  test("defaults give the textbook figures: DKW 4612, proportion 2401", () => {
    const result = sampleSize();
    expect(reason(result, "shape")).toBe(4612);
    expect(reason(result, "proportion")).toBe(2401);
    expect(result.n).toBe(4612);
  });

  test("the shape bound is ⌈ln(2/α) / (2ε²)⌉", () => {
    const result = sampleSize({ margin: 0.05, confidence: 0.99 });
    expect(reason(result, "shape")).toBe(
      Math.ceil(Math.log(2 / 0.01) / (2 * 0.05 ** 2)),
    );
  });

  test("the proportion bound follows z at the confidence", () => {
    /** z(0.99) ≈ 2.5758, so 2.5758² · ¼ / 0.05² ≈ 663.5. */
    expect(
      reason(sampleSize({ margin: 0.05, confidence: 0.99 }), "proportion"),
    ).toBe(664);
  });

  test("the rare-value bound is ⌈ln α / ln(1 − p)⌉, and can dominate", () => {
    const result = sampleSize({ rare: 0.0001 });
    expect(reason(result, "rare")).toBe(
      Math.ceil(Math.log(0.05) / Math.log(1 - 0.0001)),
    );
    expect(reason(result, "rare")).toBe(29956);
    expect(result.n).toBe(29956);
  });

  test("every reason explains itself", () => {
    for (const r of sampleSize({ rare: 0.01 }).reasons)
      expect(r.detail.length).toBeGreaterThan(0);
  });
});

describe("finite population", () => {
  test("the correction shrinks n toward the population", () => {
    const result = sampleSize({ population: 10_000 });
    expect(reason(result, "shape")).toBe(
      Math.ceil(4612 / (1 + (4612 - 1) / 10_000)),
    );
    expect(result.n).toBe(3157);
  });

  test("n never exceeds the population", () => {
    expect(sampleSize({ population: 50 }).n).toBeLessThanOrEqual(50);
    expect(sampleSize({ population: 0 }).n).toBe(0);
    expect(sampleSize({ population: 1 }).n).toBe(1);
  });

  test("a huge population leaves n essentially unchanged", () => {
    expect(sampleSize({ population: 1e12 }).n).toBe(4612);
  });
});

describe("options", () => {
  test.each([
    ["margin", 0],
    ["margin", 1],
    ["confidence", 1.5],
    ["rare", 0],
    ["population", -1],
    ["population", 2.5],
  ] as const)("%s = %p is rejected", (option, value) => {
    expect(() => sampleSize({ [option]: value })).toThrow(
      CensusError.InvalidOptionError,
    );
  });
});
