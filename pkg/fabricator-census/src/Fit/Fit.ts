/**
 * Choosing a distribution for a numeric tally: gather its observations, fit
 * every candidate, score each against the observations, and prefer the simplest
 * candidate the data cannot tell apart from the best.
 *
 * @module
 */

import { CensusError } from "../Error";
import type { Fit, FitCandidate, FitOptions, Numeric, Value } from "../Types";
import { parameters, toDistribution, unit, type UnitModel } from "./Cdf";
import { continuousScore, estimates, type Observation } from "./Continuous";
import { discreteEstimates, discreteScorer, type Count } from "./Discrete";

/**
 * The KS critical value's coefficient at α ≈ 0.05: two scores closer than `1.36
 * / √n` are within sampling noise of each other.
 */
const CRITICAL = 1.36;

/**
 * Log-uniform is tried only across at least two orders of magnitude; over a
 * narrower positive range it is nearly linear and competes with uniform on
 * noise alone.
 */
const LOG_RATIO = 100;

/**
 * Fit a distribution to a numeric tally — a number field, a string or array
 * length, a date's epoch milliseconds. Returns `null` when there is nothing to
 * fit: no finite values, or a single repeated one.
 */
export function fit(numeric: Numeric, options?: FitOptions): Fit | null {
  const summary = numeric.summary;
  if (summary === null) return null;
  const { min, max } = summary;
  if (min === max) return null;

  const discrete = options?.discrete ?? numeric.integer;
  if (discrete && !numeric.integer) throw new CensusError.NonIntegerFitError();

  const { counts, total, n } = gather(numeric);
  const high = discrete ? max + 1 : max;

  const models: UnitModel[] = discrete
    ? discreteEstimates(counts, total, min, max, summary.mean, summary.stddev)
    : estimates(
        counts.map(({ value, weight }) => ({
          position: unit(value, min, max),
          weight,
        })),
        total,
        unit(summary.mean, min, max),
        stddevOnUnit(summary.stddev, min, max),
      );
  if (min > 0 && high / min >= LOG_RATIO)
    models.push({ kind: "logarithmic", ratio: high / min });

  const score = discrete
    ? discreteScorer(counts, total, min, max)
    : continuousScore(
        counts.map(({ value, weight }): Observation => ({
          position: unit(value, min, max),
          weight,
        })),
        total,
      );

  const candidates: FitCandidate[] = models
    .map((model) => ({
      distribution: toDistribution(model, min, high),
      parameters: parameters(model),
      score: score(model),
    }))
    .filter(
      (candidate) =>
        Number.isFinite(candidate.score)
        && Object.values(candidate.distribution).every(
          (v) => typeof v === "string" || Number.isFinite(v),
        ),
    )
    .sort((a, b) => a.score - b.score);

  const best = candidates[0]!;
  const threshold = CRITICAL / Math.sqrt(n);
  const chosen = candidates
    .filter((candidate) => candidate.score <= best.score + threshold)
    .sort((a, b) => a.parameters - b.parameters || a.score - b.score)[0]!;

  return {
    target: discrete ? "discrete" : "continuous",
    min,
    max,
    distribution: chosen.distribution,
    score: chosen.score,
    n,
    threshold,
    candidates,
  };
}

/**
 * The observations a fit is scored against. Exact frequencies when the tally
 * kept them — every value, not a sample — and otherwise the summary's quantile
 * points, each standing for an equal share of the sample. `n` is the number of
 * real observations behind them, which is what the choosing threshold depends
 * on, not the number of points.
 *
 * Points come from interpolated quantiles, so on integer data one can fall
 * between two integers; it is rounded up, which is exactly how an empirical CDF
 * evaluated at integer boundaries would count it.
 */
function gather(numeric: Numeric): {
  counts: Count[];
  total: number;
  n: number;
} {
  const top = numeric.frequencies.top;
  if (top !== null) {
    const counts = top
      .map(({ value, count }) => ({ value: toNumber(value), weight: count }))
      .sort((a, b) => a.value - b.value);
    return { counts, total: numeric.finite, n: numeric.finite };
  }

  const sample = numeric.summary!.sample;
  const round = numeric.integer ? Math.ceil : (x: number) => x;
  const counts: Count[] = [];
  for (const point of sample.points) {
    const value = round(point);
    const last = counts[counts.length - 1];
    if (last !== undefined && last.value === value) last.weight++;
    else counts.push({ value, weight: 1 });
  }
  return { counts, total: sample.points.length, n: sample.size };
}

/** Frequency keys of a numeric tally are numbers, or dates tagged as ISO. */
function toNumber(value: Value): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value.type === "date")
    return Date.parse(value.value);
  return Number(value);
}

function stddevOnUnit(stddev: number, min: number, max: number): number {
  const span = max - min;
  return Number.isFinite(span) && span > 0
    ? stddev / span
    : stddev / 2 / (max / 2 - min / 2);
}
