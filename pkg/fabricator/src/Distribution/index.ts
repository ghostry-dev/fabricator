import { FabricatorError } from "../Error";
import type { Stream } from "../Random/Types";

/**
 * How randomly generated values cluster within a `{ min, max }` range.
 * Without one, generation is uniform — every value in the range is
 * equally likely.
 *
 * Each variant is a tagged object so distributions stay
 * introspectable and serializable. The `custom` variant is the escape
 * hatch: a shaping function `(u) => p` mapping a uniform draw in
 * `[0, 1)` to a position in `[0, 1)` within the range.
 */
export type Distribution =
  | Distribution.Uniform
  | Distribution.Normal
  | Distribution.Skew
  | Distribution.Triangular
  | Distribution.Logarithmic
  | Distribution.Multi
  | Distribution.Custom;

export type Range = { min: number; max: number };

export namespace Distribution {
  export type Uniform = { kind: "uniform" };
  export const uniform = (): Uniform => ({ kind: "uniform" });

  export type Normal = {
    kind: "normal";
    mean?: number | undefined;
    spread?: number | undefined;
  };
  /**
   * Bell curve truncated to the range. `mean` defaults to the range's
   * center; `spread` (standard deviation) defaults to a sixth of the
   * span, placing the bounds at roughly ±3σ before truncation.
   */
  export const normal = (params?: {
    mean?: number;
    spread?: number;
  }): Normal => ({
    kind: "normal",
    mean: params?.mean,
    spread: params?.spread,
  });

  export type Skew = { kind: "skew"; exponent: number };
  /**
   * Power curve. `exponent > 1` biases toward `min`, `exponent < 1`
   * biases toward `max`, and `exponent === 1` is uniform.
   */
  export const skew = (exponent: number): Distribution => ({
    kind: "skew",
    exponent,
  });

  export type Triangular = { kind: "triangular"; mode?: number | undefined };
  /**
   * Linear ramps peaking at `mode` (defaults to the range's center).
   */
  export const triangular = (params?: { mode?: number }): Distribution => ({
    kind: "triangular",
    mode: params?.mode,
  });

  export type Logarithmic = { kind: "logarithmic" };
  /**
   * Log-uniform (reciprocal): density proportional to `1/x`, so values
   * spread evenly across orders of magnitude and cluster toward `min`.
   * Requires a strictly positive range — the logarithm is undefined at
   * or below zero.
   */
  export const logarithmic = (): Distribution => ({ kind: "logarithmic" });

  export type Multi = {
    kind: "multi";
    components: ReadonlyArray<{ weight: number; distribution: Distribution }>;
  };
  /**
   * A weighted blend of component distributions, each drawn over the
   * same range. Localized components with distinct centers (e.g. two
   * `normal`s at different means) produce the separate peaks of a
   * multimodal distribution. Weights are relative — they need not sum
   * to 1.
   */
  export const multi = (
    components: ReadonlyArray<{ weight: number; distribution: Distribution }>,
  ): Distribution => ({ kind: "multi", components });

  export type Custom = { kind: "custom"; shape: (u: number) => number };
  /**
   * Escape hatch: `shape` maps a uniform draw in `[0, 1)` to a
   * position in `[0, 1)` within the range (an inverse CDF). The output
   * is clamped to `[0, 1]` so the result always lands within the
   * bounds.
   */
  export const custom = (shape: (u: number) => number): Distribution => ({
    kind: "custom",
    shape,
  });
}

/**
 * Map a unit position `u` in `[0, 1]` onto `[min, max]` without ever
 * forming `max - min`. That subtraction overflows to `Infinity` when
 * both ends sit on `±Number.MAX_VALUE` (and for other equally wide
 * pairs); `min + u * span` then yields `Infinity`/`NaN`. The convex
 * combination stays finite because it never adds the two magnitudes
 * as a single value.
 */
function at(u: number, min: number, max: number): number {
  return (1 - u) * min + u * max;
}

/**
 * Inverse of {@link at}: where `x` sits in `[min, max]` as a unit
 * position. `(x - min) / (max - min)` is the finite-span form;
 * `max - min` overflowing makes that `0` or `NaN`, so rewrite as
 * `1 / (1 + (max - x) / (x - min))` — a ratio of two finite distances
 * when `x` is strictly inside.
 */
function unitPosition(x: number, min: number, max: number): number {
  if (x === min) return 0;
  if (x === max) return 1;
  const span = max - min;
  if (Number.isFinite(span)) return span === 0 ? 0 : (x - min) / span;
  const left = x - min;
  if (left === 0) return 0;
  const ratio = (max - x) / left;
  if (!Number.isFinite(ratio)) return 0;
  return 1 / (1 + ratio);
}

/**
 * Build a sampler that draws values within `range` following
 * `distribution`. Each call consumes one fresh uniform draw and, by
 * construction, returns a value within `[min, max]` — distributions
 * with mass outside the range (e.g. a normal's tails) are truncated
 * via their inverse CDF rather than rejected or clamped.
 */
export function sampler(
  distribution: Distribution,
  range: Range,
  stream: Stream,
): () => number {
  const { min, max } = range;
  const span = max - min;

  switch (distribution.kind) {
    case "uniform": {
      return () => at(stream.next(), min, max);
    }

    case "skew": {
      const exponent = distribution.exponent;
      return () => at(stream.next() ** exponent, min, max);
    }

    case "triangular": {
      const mode = distribution.mode ?? at(0.5, min, max);
      const split = unitPosition(mode, min, max);
      return () => {
        const u = stream.next();
        const t =
          u < split
            ? Math.sqrt(u * split)
            : 1 - Math.sqrt((1 - u) * (1 - split));
        return at(t, min, max);
      };
    }

    case "normal": {
      const mean = distribution.mean ?? at(0.5, min, max);
      const spread =
        distribution.spread
        ?? (Number.isFinite(span) && span !== 0
          ? span / 6
          : Math.max(Math.abs(min), Math.abs(max)) / 6 || 1);

      /**
       * Inverse-CDF truncation: confine the uniform draw to the
       * probability mass that already falls within [min, max], so
       * every mapped value stays in range without rejection.
       */
      const lower = normalCdf((min - mean) / spread);
      const upper = normalCdf((max - mean) / spread);

      return () => {
        const p = lower + stream.next() * (upper - lower);
        const value = mean + spread * normalInv(p);
        return clamp(value, min, max);
      };
    }

    case "logarithmic": {
      if (min <= 0) {
        throw new FabricatorError.InvalidDistributionBoundError(
          "logarithmic",
          min,
          max,
        );
      }
      /**
       * Inverse-CDF of a log-uniform: a uniform draw in log-space —
       * `min * (max/min)^u` — lands in [min, max) by construction.
       */
      const ratio = max / min;
      return () => min * ratio ** stream.next();
    }

    case "multi": {
      /**
       * Pick a component by weight, then draw from it. Each component
       * sampler already confines itself to [min, max], so the blend
       * does too; the multimodality comes from the components' own
       * shapes.
       */
      const pick = weighted(
        distribution.components.map((component): [number, () => number] => [
          component.weight,
          sampler(component.distribution, range, stream),
        ]),
        stream,
        "Distribution.multi",
      );
      return () => {
        const distribution = pick();
        const value = distribution();
        return value;
      };
    }

    case "custom": {
      const shape = distribution.shape;
      return () => at(clamp(shape(stream.next()), 0, 1), min, max);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 approximation
 * of the error function (|error| < 1.5e-7).
 */
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);

  /** Horner's method over the polynomial coefficients. */
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t
      + 0.254829592)
    * t;

  return sign * (1 - poly * Math.exp(-z * z));
}

/**
 * Inverse of the standard normal CDF (quantile function) via Peter
 * Acklam's rational approximation (relative error < 1.15e-9).
 */
function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const low = 0.02425;
  const high = 1 - low;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((-7.784894002430293e-3 * q - 3.223964580411365e-1) * q
        - 2.400758277161838)
        * q
        - 2.549732539343734)
        * q
        + 4.374664141464968)
        * q
        + 2.938163982698783)
      / ((((7.784695709041462e-3 * q + 3.224671290700398e-1) * q
        + 2.445134137142996)
        * q
        + 3.754408661907416)
        * q
        + 1)
    );
  }

  if (p <= high) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((-3.969683028665376e1 * r + 2.209460984245205e2) * r
        - 2.759285104469687e2)
        * r
        + 1.38357751867269e2)
        * r
        - 3.066479806614716e1)
        * r
        + 2.506628277459239)
        * q)
      / (((((-5.447609879822406e1 * r + 1.615858368580409e2) * r
        - 1.556989798598866e2)
        * r
        + 6.680131188771972e1)
        * r
        - 1.328068155288572e1)
        * r
        + 1)
    );
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(
      ((((-7.784894002430293e-3 * q - 3.223964580411365e-1) * q
        - 2.400758277161838)
        * q
        - 2.549732539343734)
        * q
        + 4.374664141464968)
        * q
      + 2.938163982698783
    )
    / ((((7.784695709041462e-3 * q + 3.224671290700398e-1) * q
      + 2.445134137142996)
      * q
      + 3.754408661907416)
      * q
      + 1)
  );
}

export function sample<$T>(list: ReadonlyArray<$T>, stream: Stream): $T {
  const index = Math.floor(stream.next() * list.length);
  const item: $T = list[index]!;
  return item;
}

/**
 * Fisher–Yates (Durstenfeld) shuffle: a new array holding `items` in a
 * uniformly random order — every permutation is equally likely. Does
 * not mutate `items`, matching `sample`/`weighted`'s read-only
 * convention.
 */
export function shuffle<$T>(items: ReadonlyArray<$T>, stream: Stream): $T[] {
  const shuffled = [...items];

  for (let i = 1; i < shuffled.length; i++) {
    const j = Math.floor(stream.next() * (i + 1));
    const swap = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = swap;
  }

  return shuffled;
}

/**
 * `weighted()`'s own inclusion rule: whether this entry stays in the
 * draw table. `0` is valid and disables the outcome; negative/`NaN`
 * are rejected earlier by {@link isValidWeight}. Exposed so
 * `Enumeration/Plan.ts` and the construction guards share one
 * definition of "will this be drawn" rather than each writing
 * `weight > 0`.
 */
export function isDrawable(weight: number): boolean {
  return weight > 0;
}

/**
 * Whether a weight is *expressible* at all, as opposed to whether it is
 * drawable. `0` is valid and disables the outcome; a negative weight or
 * `NaN` is a mistake. `Infinity` is rejected because it cannot be summed
 * into a usable draw table — every cumulative bound becomes `Infinity`,
 * so `weighted()`'s `x < weight` scan matches nothing.
 */
export function isValidWeight(weight: number): boolean {
  return weight >= 0 && Number.isFinite(weight);
}

/**
 * Outcomes that still have a positive weight after applying the
 * baseline of `1` for any unspecified (missing or explicitly
 * `undefined`) key. The one home of that `?? 1` default, so
 * `assertDrawableKeyedWeights` and `Enumeration/Plan.ts` cannot drift.
 */
export function drawableOutcomes<$Outcome extends string>(
  outcomes: ReadonlyArray<$Outcome>,
  weights: Readonly<Record<string, number | undefined>> | undefined,
): ReadonlyArray<$Outcome> {
  return outcomes.filter((outcome) => isDrawable(weights?.[outcome] ?? 1));
}

/**
 * Two-stage guard for a `[weight, item]` list (`enum`/`choice`'s
 * `.weighted()` registries). Stage 1 rejects any entry that is not
 * {@link isValidWeight}; stage 2 rejects a list with no
 * {@link isDrawable} entry left. `label` names the call site
 * (`"T.enum.weighted"`/`"T.choice.weighted"`), `noun` the kind of
 * entry (`"member"`/`"option"`).
 */
export function assertDrawableWeights(
  label: string,
  noun: string,
  items: ReadonlyArray<readonly [number, unknown]>,
): void {
  for (let i = 0; i < items.length; i++) {
    const weight = items[i]![0];
    if (!isValidWeight(weight)) {
      throw new FabricatorError.InvalidWeightError(label, weight, {
        kind: "index",
        index: i,
        noun,
      });
    }
  }

  if (!items.some(([weight]) => isDrawable(weight))) {
    throw new FabricatorError.NoDrawableOutcomesError(label, noun);
  }
}

/**
 * The same two-stage guard as {@link assertDrawableWeights}, for the
 * kinds whose `.weighted(...)` weighs a *fixed, named* outcome set
 * (`boolean`'s `true`/`false`; `nullable`/`nullish`/`undefinable`/
 * `object.omittable`/`object.optional`'s presence outcomes) rather than a
 * caller-supplied list. Stage 2 must see the kind's **full** outcome list
 * — an omitted key still defaults to `1` — hence `outcomes`.
 *
 * An explicitly-`undefined` value means "unspecified" — `Weights`'
 * keys are all optional and fall back to a baseline of `1` — so it is
 * skipped in stage 1 and defaulted in stage 2.
 */
export function assertDrawableKeyedWeights<$Outcome extends string>(
  label: string,
  outcomes: ReadonlyArray<$Outcome>,
  weights: Readonly<Record<string, number | undefined>>,
): void {
  for (const [key, weight] of Object.entries(weights)) {
    if (weight === undefined) continue;
    if (!isValidWeight(weight)) {
      throw new FabricatorError.InvalidWeightError(label, weight, {
        kind: "name",
        name: key,
      });
    }
  }

  if (drawableOutcomes(outcomes, weights).length === 0) {
    throw new FabricatorError.NoDrawableOutcomesError(label, "outcome");
  }
}

export function weighted<const $Item>(
  weights: ReadonlyArray<readonly [number, $Item]>,
  stream: Stream,
  label: string,
): () => $Item {
  let sum = 0;

  const weightings = weights
    .filter(([weight]) => isDrawable(weight))
    .map(([weight, item]) => [(sum += weight), item] as const);

  /**
   * Eager: this closure is built during `new Fabricator(...)`, so an
   * empty table is a construction error, matching the `.weighted()`
   * guards. A lazy throw would surface at `.fabricate()` instead.
   */
  if (weightings.length === 0) {
    throw new FabricatorError.NoDrawableOutcomesError(label, "outcome");
  }

  return () => {
    const x = stream.next() * sum;

    const chosen = weightings.find(([weight]) => x < weight);

    return chosen![1];
  };
}
