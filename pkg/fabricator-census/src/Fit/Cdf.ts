/**
 * Candidate CDFs on the unit interval. Every variant core's `sampler` draws is
 * an affine map of a draw on `[0, 1]` — `at(u, min, max)` — so fitting on unit
 * positions and converting parameters back at the end loses nothing, and keeps
 * epoch milliseconds or `±Number.MAX_VALUE` ranges from ever entering the
 * arithmetic.
 *
 * @module
 */

import { normalCdf } from "@ghostry/fabricator/internal";
import type { FittedDistribution } from "../Types";

/**
 * A candidate in unit coordinates. `mode`, `mean` and `spread` are positions
 * and widths on `[0, 1]`; `ratio` is the range's `max / min`, which is all a
 * log-uniform needs.
 */
export type UnitModel =
  | { kind: "uniform" }
  | { kind: "skew"; exponent: number }
  | { kind: "triangular"; mode: number }
  | { kind: "normal"; mean: number; spread: number }
  | { kind: "logarithmic"; ratio: number };

/** Free parameters per candidate, for preferring the simpler of two close fits. */
export function parameters(model: UnitModel): number {
  switch (model.kind) {
    case "uniform":
    case "logarithmic":
      return 0;
    case "skew":
    case "triangular":
      return 1;
    case "normal":
      return 2;
  }
}

/**
 * The CDF matching exactly how `sampler` maps a uniform draw `u` for each
 * variant: `u^k` for skew, the two-ramp inverse for triangular, inverse-CDF
 * truncation for normal (using core's own `normalCdf`), and `min·(max/min)^u`
 * for logarithmic.
 */
export function unitCdf(model: UnitModel): (t: number) => number {
  switch (model.kind) {
    case "uniform":
      return clamp;
    case "skew": {
      const inverse = 1 / model.exponent;
      return (t) => clamp(t) ** inverse;
    }
    case "triangular": {
      const split = model.mode;
      return (t) => {
        const x = clamp(t);
        if (x < split) return (x * x) / split;
        if (split >= 1) return 1;
        return 1 - (1 - x) ** 2 / (1 - split);
      };
    }
    case "normal": {
      const { mean, spread } = model;
      const lower = normalCdf(-mean / spread);
      const mass = normalCdf((1 - mean) / spread) - lower;
      if (!(mass > 0)) return clamp;
      return (t) =>
        clamp((normalCdf((clamp(t) - mean) / spread) - lower) / mass);
    }
    case "logarithmic": {
      const { ratio } = model;
      const log = Math.log(ratio);
      return (t) => Math.log(1 + clamp(t) * (ratio - 1)) / log;
    }
  }
}

/**
 * Where `x` sits in `[min, max]` as a unit position, without forming `max -
 * min` when that would overflow — the same trap core's `unitPosition` avoids,
 * restated because it is private there.
 */
export function unit(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const span = max - min;
  if (Number.isFinite(span)) return (x - min) / span;
  return (x / 2 - min / 2) / (max / 2 - min / 2);
}

/**
 * Unit parameters back onto `[min, max]`: positions through the same convex
 * combination `sampler` uses, widths scaled term by term so neither forms `max -
 * min`.
 */
export function toDistribution(
  model: UnitModel,
  min: number,
  max: number,
): FittedDistribution {
  const at = (u: number) => (1 - u) * min + u * max;
  switch (model.kind) {
    case "uniform":
      return { kind: "uniform" };
    case "logarithmic":
      return { kind: "logarithmic" };
    case "skew":
      return { kind: "skew", exponent: model.exponent };
    case "triangular":
      return { kind: "triangular", mode: at(model.mode) };
    case "normal":
      return {
        kind: "normal",
        mean: at(model.mean),
        spread: model.spread * max - model.spread * min,
      };
  }
}

function clamp(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}
