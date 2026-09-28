/**
 * Fitting and scoring for continuous targets — `T.number` and `T.date` — which
 * core draws through `sampler` directly, so the candidate CDF is the whole
 * model.
 *
 * @module
 */

import { normalCdf } from "@ghostry/fabricator/internal";
import { unitCdf, type UnitModel } from "./Cdf";
import { nelderMead } from "./Optimize";

/**
 * A distinct observed value as a unit position, with how many observations
 * share it. Sorted ascending, so the empirical CDF is a running sum.
 */
export type Observation = { position: number; weight: number };

/**
 * The Kolmogorov–Smirnov distance between the weighted empirical CDF and `cdf`.
 * Tied observations are grouped, so the empirical CDF jumps once per distinct
 * value and the gap is measured on both sides of that jump.
 */
export function ksScore(
  cdf: (t: number) => number,
  observations: ReadonlyArray<Observation>,
  total: number,
): number {
  let before = 0;
  let distance = 0;
  for (const { position, weight } of observations) {
    const model = cdf(position);
    const after = before + weight;
    distance = Math.max(
      distance,
      after / total - model,
      model - before / total,
    );
    before = after;
  }
  return distance;
}

/**
 * Truncated-normal maximum likelihood on `[0, 1]`, starting from the sample
 * moments. Sample moments alone underestimate the spread of a heavily truncated
 * source — the tails `sampler` cut off are exactly what the moments cannot see
 * — and the likelihood, normalized by the mass inside the range, recovers it.
 * Optimized over `(mean, ln spread)` so the spread stays positive; the bounds
 * keep a near-uniform sample, whose likelihood rises without limit as the
 * spread grows, from wandering off.
 */
export function normalMle(
  observations: ReadonlyArray<Observation>,
  total: number,
  start: { mean: number; spread: number },
): { mean: number; spread: number } {
  const negativeLikelihood = ([mean, logSpread]: ReadonlyArray<number>) => {
    const spread = Math.exp(logSpread!);
    if (!(spread > 1e-6 && spread < 100) || mean! < -5 || mean! > 6)
      return Infinity;
    const mass = normalCdf((1 - mean!) / spread) - normalCdf(-mean! / spread);
    if (!(mass > 0)) return Infinity;
    let sum = 0;
    for (const { position, weight } of observations) {
      const z = (position - mean!) / spread;
      sum += 0.5 * weight * z * z;
    }
    return sum + total * (logSpread! + Math.log(mass));
  };
  const [mean, logSpread] = nelderMead(
    negativeLikelihood,
    [start.mean, Math.log(start.spread)],
    [0.05, 0.25],
    400,
  );
  return { mean: mean!, spread: Math.exp(logSpread!) };
}

/**
 * Each candidate's estimate from the exact moments, positions already on the
 * unit interval:
 *
 * - skew: `t = u^k` has mean `1 / (1 + k)`, so `k = 1/t̄ − 1`. The log-likelihood
 *   estimate `mean(−ln t)` is undefined here, since the observed minimum sits
 *   at `t = 0`.
 * - triangular: a triangle on `[0, 1]` has mean `(1 + mode) / 3`.
 * - normal: the truncated maximum likelihood above.
 */
export function estimates(
  observations: ReadonlyArray<Observation>,
  total: number,
  mean: number,
  spread: number,
): UnitModel[] {
  const models: UnitModel[] = [{ kind: "uniform" }];
  if (mean > 0 && mean < 1)
    models.push({ kind: "skew", exponent: 1 / mean - 1 });
  models.push({
    kind: "triangular",
    mode: Math.min(1, Math.max(0, 3 * mean - 1)),
  });
  models.push({
    kind: "normal",
    ...normalMle(observations, total, {
      mean,
      spread: spread > 0 ? spread : 1 / 6,
    }),
  });
  return models;
}

export function continuousScore(
  observations: ReadonlyArray<Observation>,
  total: number,
): (model: UnitModel) => number {
  return (model) => ksScore(unitCdf(model), observations, total);
}
