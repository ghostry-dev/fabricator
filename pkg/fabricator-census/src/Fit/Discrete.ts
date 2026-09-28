/**
 * Fitting and scoring for discrete targets — `T.number.integer` and string,
 * array and record lengths — which core draws through `discreteSampler`: a
 * continuous draw over `[min, max + 1)`, floored. The model is therefore the
 * bucket probabilities `F(k + 1) − F(k)` of a continuous CDF, not the CDF
 * itself, and a KS distance on raw integers would be miscalibrated by ties.
 *
 * @module
 */

import { unit, unitCdf, type UnitModel } from "./Cdf";
import { estimates, type Observation } from "./Continuous";
import { golden, nelderMead } from "./Optimize";

/** A distinct observed integer and how many observations share it. */
export type Count = { value: number; weight: number };

/**
 * The largest gap between the empirical CDF and the model's, both evaluated at
 * integer boundaries. The model's CDF at `k` is `F(k + 1)`, with `F` taken over
 * the axis `discreteSampler` draws on. Between two observed values the
 * empirical CDF is flat while the model's rises, so the gap is largest at an
 * end of that run — each observed value, and the integer just before it.
 */
export function discreteScore(
  cdf: (t: number) => number,
  counts: ReadonlyArray<Count>,
  total: number,
  min: number,
  max: number,
): number {
  const model = (k: number) => cdf(unit(k + 1, min, max + 1));
  let before = 0;
  let previous = -Infinity;
  let distance = 0;
  for (const { value, weight } of counts) {
    if (value - 1 >= min && value - 1 > previous)
      distance = Math.max(
        distance,
        Math.abs(before / total - model(value - 1)),
      );
    const after = before + weight;
    distance = Math.max(distance, Math.abs(after / total - model(value)));
    before = after;
    previous = value;
  }
  return distance;
}

/**
 * Start from the continuous estimates on bucket midpoints — `k + 0.5`, the
 * center of the bucket `discreteSampler` floors into `k` — then minimize the
 * discrete score from there. Midpoint estimates are biased on a narrow range,
 * where a bucket is a large share of the span (a skew over `0–5` is the case),
 * and the refinement is what corrects that.
 */
export function discreteEstimates(
  counts: ReadonlyArray<Count>,
  total: number,
  min: number,
  max: number,
  mean: number,
  stddev: number,
): UnitModel[] {
  const high = max + 1;
  const midpoints: Observation[] = counts.map(({ value, weight }) => ({
    position: unit(value + 0.5, min, high),
    weight,
  }));
  const span = high - min;
  const spread = Number.isFinite(span) && span > 0 ? stddev / span : 1 / 6;
  const score = discreteScorer(counts, total, min, max);

  return estimates(midpoints, total, unit(mean + 0.5, min, high), spread).map(
    (model): UnitModel => {
      switch (model.kind) {
        case "skew": {
          const start = Math.log(model.exponent);
          const exponent = Math.exp(
            golden(
              (log) => score({ kind: "skew", exponent: Math.exp(log) }),
              start - 2,
              start + 2,
            ),
          );
          return { kind: "skew", exponent };
        }
        case "triangular":
          return {
            kind: "triangular",
            mode: golden((mode) => score({ kind: "triangular", mode }), 0, 1),
          };
        case "normal": {
          const [mean, logSpread] = nelderMead(
            ([mean, logSpread]) => {
              const spread = Math.exp(logSpread!);
              if (!(spread > 1e-6 && spread < 100)) return Infinity;
              return score({ kind: "normal", mean: mean!, spread });
            },
            [model.mean, Math.log(model.spread)],
            [0.02, 0.1],
            300,
          );
          return { kind: "normal", mean: mean!, spread: Math.exp(logSpread!) };
        }
        default:
          return model;
      }
    },
  );
}

export function discreteScorer(
  counts: ReadonlyArray<Count>,
  total: number,
  min: number,
  max: number,
): (model: UnitModel) => number {
  return (model) => discreteScore(unitCdf(model), counts, total, min, max);
}
