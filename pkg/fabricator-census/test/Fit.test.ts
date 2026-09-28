import { describe, expect, test } from "bun:test";
import { FabricatorError, initialize, registry } from "@ghostry/fabricator";
import {
  census,
  CensusError,
  fit,
  type Census,
  type CensusOptions,
  type Fit,
  type Numeric,
} from "@ghostry/fabricator-census";

type Instance = ReturnType<typeof initialize<typeof registry>>;

/**
 * One instance per test, with a pinned clock so the same salt replays exactly
 * (see core's AGENTS.md "Tooling / conventions").
 */
function fabricate(
  salt: string,
  schema: (
    T: Instance["T"],
  ) => ConstructorParameters<Instance["Fabricator"]>[0],
  count = 10_000,
): unknown[] {
  const { T, Fabricator } = initialize({ salt, clock: new Date(0) });
  const built = new Fabricator(schema(T));
  return Array.from({ length: count }, () => built.fabricate());
}

function fitted(
  values: unknown[],
  pick: (census: Census) => Numeric | null | undefined,
  options?: { census?: CensusOptions; discrete?: boolean },
): Fit {
  const tally = pick(census.from(values, { seed: "fit", ...options?.census }));
  const result = fit(tally!, { discrete: options?.discrete });
  if (result === null) throw new Error("nothing to fit");
  return result;
}

const number = (c: Census) => c.root.number;

describe("continuous targets", () => {
  test("uniform data picks uniform over closer multi-parameter fits", () => {
    const result = fitted(
      fabricate("uniform", (T) => T.number.whereby({ min: 0, max: 100 })),
      number,
    );
    expect(result.target).toBe("continuous");
    expect(result.distribution).toEqual({ kind: "uniform" });
    expect(result.candidates[0]!.score).toBeLessThanOrEqual(result.score);
  });

  test("normal recovers mean and spread", () => {
    const result = fitted(
      fabricate("normal", (T) =>
        T.number.whereby({
          min: 0,
          max: 100,
          distribution: { kind: "normal", mean: 40, spread: 10 },
        }),
      ),
      number,
    );
    expect(result.distribution.kind).toBe("normal");
    if (result.distribution.kind !== "normal") return;
    expect(result.distribution.mean).toBeCloseTo(40, 0);
    expect(result.distribution.spread).toBeCloseTo(10, 0);
  });

  test("a heavily truncated normal recovers the spread its moments cannot see", () => {
    const values = fabricate("truncated", (T) =>
      T.number.whereby({
        min: 0,
        max: 100,
        distribution: { kind: "normal", mean: 0, spread: 30 },
      }),
    );
    const tally = census.from(values, { seed: "fit" }).root.number!;
    expect(tally.summary!.stddev).toBeLessThan(20);

    const result = fit(tally)!;
    expect(result.distribution.kind).toBe("normal");
    if (result.distribution.kind !== "normal") return;
    expect(Math.abs(result.distribution.spread - 30)).toBeLessThan(3);
  });

  test("skew recovers its exponent", () => {
    const result = fitted(
      fabricate("skew", (T) =>
        T.number.whereby({
          min: 0,
          max: 100,
          distribution: { kind: "skew", exponent: 3 },
        }),
      ),
      number,
    );
    expect(result.distribution.kind).toBe("skew");
    if (result.distribution.kind !== "skew") return;
    expect(Math.abs(result.distribution.exponent - 3)).toBeLessThan(0.15);
  });

  test("triangular recovers its mode", () => {
    const result = fitted(
      fabricate("triangular", (T) =>
        T.number.whereby({
          min: 0,
          max: 100,
          distribution: { kind: "triangular", mode: 20 },
        }),
      ),
      number,
    );
    expect(result.distribution.kind).toBe("triangular");
    if (result.distribution.kind !== "triangular") return;
    expect(Math.abs(result.distribution.mode - 20)).toBeLessThan(2);
  });

  test("logarithmic is tried across orders of magnitude, and wins there", () => {
    const result = fitted(
      fabricate("logarithmic", (T) =>
        T.number.whereby({
          min: 1,
          max: 10_000,
          distribution: { kind: "logarithmic" },
        }),
      ),
      number,
    );
    expect(result.distribution).toEqual({ kind: "logarithmic" });
  });

  test("logarithmic is not tried over a narrow or non-positive range", () => {
    const result = fitted(
      fabricate("narrow-log", (T) => T.number.whereby({ min: 1, max: 50 })),
      number,
    );
    expect(result.candidates.map((c) => c.distribution.kind)).not.toContain(
      "logarithmic",
    );
  });

  test("dates fit continuously on epoch milliseconds", () => {
    const mean = Date.parse("2024-05-01");
    const day = 864e5;
    const result = fitted(
      fabricate("date", (T) =>
        T.date.whereby({
          min: new Date("2024-01-01"),
          max: new Date("2025-01-01"),
          distribution: { kind: "normal", mean, spread: 30 * day },
        }),
      ),
      (c) => c.root.date!.epoch,
      { discrete: false },
    );
    expect(result.target).toBe("continuous");
    expect(result.distribution.kind).toBe("normal");
    if (result.distribution.kind !== "normal") return;
    expect(Math.abs(result.distribution.mean - mean)).toBeLessThan(day);
    expect(Math.abs(result.distribution.spread - 30 * day)).toBeLessThan(
      2 * day,
    );
  });
});

describe("discrete targets", () => {
  test("integer data fits discretely by default", () => {
    const result = fitted(
      fabricate("int-uniform", (T) =>
        T.number.integer.whereby({ min: 0, max: 1000 }),
      ),
      number,
    );
    expect(result.target).toBe("discrete");
    expect(result.distribution).toEqual({ kind: "uniform" });
  });

  test("integer skew recovers its exponent", () => {
    const result = fitted(
      fabricate("int-skew", (T) =>
        T.number.integer.whereby({
          min: 0,
          max: 1000,
          distribution: { kind: "skew", exponent: 2 },
        }),
      ),
      number,
    );
    expect(result.distribution.kind).toBe("skew");
    if (result.distribution.kind !== "skew") return;
    expect(Math.abs(result.distribution.exponent - 2)).toBeLessThan(0.1);
  });

  test("integer normal recovers parameters on the [min, max + 1) axis", () => {
    const result = fitted(
      fabricate("int-normal", (T) =>
        T.number.integer.whereby({
          min: 0,
          max: 1000,
          distribution: { kind: "normal", mean: 300, spread: 100 },
        }),
      ),
      number,
    );
    expect(result.distribution.kind).toBe("normal");
    if (result.distribution.kind !== "normal") return;
    expect(Math.abs(result.distribution.mean - 300)).toBeLessThan(5);
    expect(Math.abs(result.distribution.spread - 100)).toBeLessThan(5);
  });

  /**
   * Six integers: a KS distance on the raw values ties every candidate, since
   * each empirical jump is a sixth of the mass and no continuous CDF can follow
   * it, so a continuous fit cannot rank them. Scoring the bucket probabilities
   * core actually produces recovers the exponent.
   */
  test("a narrow skewed integer range recovers its exponent where a continuous score cannot", () => {
    const values = fabricate("narrow", (T) =>
      T.number.integer.whereby({
        min: 0,
        max: 5,
        distribution: { kind: "skew", exponent: 2 },
      }),
    );

    const discrete = fitted(values, number);
    expect(discrete.distribution.kind).toBe("skew");
    if (discrete.distribution.kind !== "skew") return;
    expect(Math.abs(discrete.distribution.exponent - 2)).toBeLessThan(0.15);
    expect(discrete.score).toBeLessThan(discrete.threshold);

    const continuous = fitted(values, number, { discrete: false });
    expect(continuous.distribution.kind).not.toBe("skew");
    expect(continuous.score).toBeGreaterThan(10 * discrete.score);
  });

  test("a sampled tally whose frequencies saturated fits from its quantile points", () => {
    const result = fitted(
      fabricate("points", (T) =>
        T.number.integer.whereby({
          min: 0,
          max: 1000,
          distribution: { kind: "skew", exponent: 2 },
        }),
      ),
      number,
      { census: { reservoir: 3000, distinct: 50 } },
    );
    expect(result.n).toBe(3000);
    expect(result.distribution.kind).toBe("skew");
    if (result.distribution.kind !== "skew") return;
    expect(Math.abs(result.distribution.exponent - 2)).toBeLessThan(0.15);
  });
});

describe("length targets", () => {
  test("string length is a discrete target", () => {
    const result = fitted(
      fabricate("string-length", (T) =>
        T.string.whereby({
          length: {
            min: 0,
            max: 40,
            distribution: { kind: "skew", exponent: 2 },
          },
          composition: { lowercase: 1 },
        }),
      ),
      (c) => c.root.string!.length,
    );
    expect(result.target).toBe("discrete");
    expect(result.distribution.kind).toBe("skew");
    if (result.distribution.kind !== "skew") return;
    expect(Math.abs(result.distribution.exponent - 2)).toBeLessThan(0.1);
  });

  test("array length is a discrete target", () => {
    const result = fitted(
      fabricate("array-length", (T) =>
        T.array(T.boolean).whereby({
          length: {
            min: 1,
            max: 30,
            distribution: { kind: "normal", mean: 10, spread: 5 },
          },
        }),
      ),
      (c) => c.root.array!.length,
    );
    expect(result.distribution.kind).toBe("normal");
    if (result.distribution.kind !== "normal") return;
    expect(Math.abs(result.distribution.mean - 10)).toBeLessThan(0.5);
    expect(Math.abs(result.distribution.spread - 5)).toBeLessThan(0.5);
  });
});

describe("fit", () => {
  test("nothing to fit returns null", () => {
    expect(fit(census.from([7, 7, 7]).root.number!)).toBeNull();
    expect(fit(census.from([NaN]).root.number!)).toBeNull();
  });

  test("a discrete fit of non-integer data throws", () => {
    const tally = census.from([0.5, 1.5]).root.number!;
    expect(() => fit(tally, { discrete: true })).toThrow(
      CensusError.NonIntegerFitError,
    );
    expect(() => fit(tally, { discrete: true })).toThrow(FabricatorError);
  });

  test("a fit is plain data, candidates best first", () => {
    const result = fitted(
      fabricate("plain", (T) => T.number.whereby({ min: 0, max: 1 })),
      number,
    );
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    const scores = result.candidates.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(result.threshold).toBeCloseTo(1.36 / Math.sqrt(result.n), 12);
  });

  test("ranges spanning ±Number.MAX_VALUE fit without overflow", () => {
    const result = fitted(
      fabricate("wide", (T) =>
        T.number.whereby({ min: -Number.MAX_VALUE, max: Number.MAX_VALUE }),
      ),
      number,
    );
    expect(result.distribution).toEqual({ kind: "uniform" });
  });
});
