/**
 * How many rows a census needs. Dialect-free — the answer depends on the
 * statistics a census computes, not on where the rows come from — so it lives
 * on the main entry point, and the SQL helpers call it.
 *
 * @module
 */

import { normalInv } from "@ghostry/fabricator/internal";
import { CensusError } from "./Error";

export type SampleSizeOptions = {
  /**
   * Largest tolerated error: in a CDF value for the shape criterion, in a
   * proportion for the proportion criterion. Defaults to `0.02`.
   */
  margin?: number | undefined;

  /** Confidence that the error stays within `margin`. Defaults to `0.95`. */
  confidence?: number | undefined;

  /**
   * Rows in the population sampled from. Applies the finite population
   * correction and caps the result at the population.
   */
  population?: number | undefined;

  /**
   * The frequency of the rarest value the sample should see at least once, with
   * `confidence`. Omitted, no rare-value criterion applies.
   */
  rare?: number | undefined;
};

/** One criterion's requirement, so a caller can show why `n` is what it is. */
export type SampleSizeReason = {
  criterion: "shape" | "proportion" | "rare";

  /** Rows this criterion needs, after the finite population correction. */
  n: number;
  detail: string;
};

export type SampleSize = {
  /** The largest requirement among `reasons`. */
  n: number;
  reasons: SampleSizeReason[];
};

/**
 * The rows needed for a census's statistics to hold to `margin` with
 * `confidence`: the largest of three criteria.
 *
 * - shape: the Dvoretzky–Kiefer–Wolfowitz bound `⌈ln(2/α) / (2ε²)⌉`, which keeps
 *   the whole empirical CDF within `margin` of the true one — the bound
 *   distribution fits rely on. 4612 at the defaults.
 * - proportion: `⌈z² · ¼ / ε²⌉`, a presence, null or enum weight within `margin`
 *   in the worst case, a proportion of one half. 2401 at the defaults.
 * - rare: `⌈ln α / ln(1 − p)⌉`, enough to see a value of frequency `p` at least
 *   once.
 */
export function sampleSize(options?: SampleSizeOptions): SampleSize {
  const margin = unitOption("margin", options?.margin, 0.02);
  const confidence = unitOption("confidence", options?.confidence, 0.95);
  const alpha = 1 - confidence;
  const population = options?.population;

  if (
    population !== undefined
    && !(Number.isSafeInteger(population) && population >= 0)
  ) {
    throw new CensusError.InvalidOptionError(
      "population",
      population,
      "an integer ≥ 0",
    );
  }

  const correct = (n: number) => {
    if (population === undefined) return n;
    const corrected = Math.ceil(n / (1 + (n - 1) / population));
    return Math.min(corrected, population);
  };

  const z = normalInv(1 - alpha / 2);
  const reasons: SampleSizeReason[] = [
    {
      criterion: "shape",
      n: correct(Math.ceil(Math.log(2 / alpha) / (2 * margin ** 2))),
      detail: `every CDF value within ±${margin} at ${confidence} confidence (DKW)`,
    },
    {
      criterion: "proportion",
      n: correct(Math.ceil((z ** 2 * 0.25) / margin ** 2)),
      detail: `every proportion within ±${margin} at ${confidence} confidence`,
    },
  ];

  const rare = options?.rare;
  if (rare !== undefined) {
    const p = unitOption("rare", rare, rare);
    reasons.push({
      criterion: "rare",
      n: correct(Math.ceil(Math.log(alpha) / Math.log(1 - p))),
      detail: `a value of frequency ${p} seen at least once at ${confidence} confidence`,
    });
  }

  return { n: Math.max(...reasons.map((reason) => reason.n)), reasons };
}

function unitOption(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;

  if (!(typeof value === "number" && value > 0 && value < 1))
    throw new CensusError.InvalidOptionError(name, value, "a number in (0, 1)");

  return value;
}
