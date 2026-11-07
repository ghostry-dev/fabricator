import type { Distribution } from "./Distribution";
import { FabricatorError } from "./Error";
import { isPlainObject } from "./Utility/Core";

/**
 * Canonical endpoint stored on `[Meta].whereby`. Call sites still accept a
 * scalar (inclusive) via {@link InputBound}; `.whereby()` runs {@link toBound} so
 * adapters always see this shape — never a scalar/object union.
 */
export type Bound<$T> = { value: $T; exclusive: boolean };

/**
 * What `.whereby({ min, max })` accepts: a scalar is inclusive, an object names
 * an endpoint policy. `exclusive` is required on the object form so that form
 * exists only to state one.
 */
export type InputBound<$T> = $T | Bound<$T>;

/**
 * Collapse a call-site bound to the stored shape. A `Date` is a scalar here
 * (`isPlainObject` rejects it); only a `{ value, exclusive }` literal is
 * already canonical.
 */
export function toBound<$T>(input: InputBound<$T>): Bound<$T> {
  if (isCanonicalBound(input))
    return { value: input.value, exclusive: input.exclusive };
  return { value: input, exclusive: false };
}

function isCanonicalBound<$T>(input: InputBound<$T>): input is Bound<$T> {
  return (
    isPlainObject(input)
    && "value" in input
    && typeof input.exclusive === "boolean"
  );
}

/**
 * Inclusive integer interval implied by a discrete Bound pair. Exclusive min is
 * `value + 1`, exclusive max is `value - 1` — the same unit the length/
 * integer/bigint draws already use. Empty iff `min > max`.
 */
export function effectiveDiscrete(
  min: Bound<number>,
  max: Bound<number>,
): { min: number; max: number } {
  return {
    min: min.exclusive ? min.value + 1 : min.value,
    max: max.exclusive ? max.value - 1 : max.value,
  };
}

export function effectiveDiscreteBigint(
  min: Bound<bigint>,
  max: Bound<bigint>,
): { min: bigint; max: bigint } {
  return {
    min: min.exclusive ? min.value + BigInt(1) : min.value,
    max: max.exclusive ? max.value - BigInt(1) : max.value,
  };
}

export function assertNonemptyDiscrete(
  label: string,
  min: Bound<number>,
  max: Bound<number>,
): void {
  const range = effectiveDiscrete(min, max);
  if (range.min > range.max) {
    throw new FabricatorError.EmptyRangeError(label, min, max);
  }
}

export function assertNonemptyDiscreteBigint(
  label: string,
  min: Bound<bigint>,
  max: Bound<bigint>,
): void {
  const range = effectiveDiscreteBigint(min, max);
  if (range.min > range.max) {
    throw new FabricatorError.EmptyRangeError(label, min, max);
  }
}

/**
 * Continuous emptiness: inverted bounds, a point range with either end
 * exclusive, or both ends exclusive with no float strictly between them.
 * Sampling still uses the closed interval and {@link constrainContinuous} steps
 * off an exclusive endpoint — this check is what makes that step always have
 * somewhere to land.
 */
export function assertNonemptyContinuous(
  label: string,
  min: Bound<number>,
  max: Bound<number>,
): void {
  if (isEmptyContinuous(min, max)) {
    throw new FabricatorError.EmptyRangeError(label, min, max);
  }
}

function isEmptyContinuous(min: Bound<number>, max: Bound<number>): boolean {
  if (min.value > max.value) return true;
  if (min.value === max.value) return min.exclusive || max.exclusive;
  if (min.exclusive && max.exclusive) {
    return towardInterior(min.value, max.value) >= max.value;
  }
  return false;
}

/**
 * One ulp toward `toward` from `value`. Approximate, and enough to leave an
 * exclusive endpoint without rejection-looping a truncated distribution that
 * clamped onto it.
 */
export function towardInterior(value: number, toward: number): number {
  if (value === toward) return value;
  const direction = toward > value ? 1 : -1;
  if (value === 0) return direction * Number.MIN_VALUE;
  const scaled = value + direction * Number.EPSILON * Math.abs(value);
  if (scaled !== value) return scaled;
  return value + direction * Number.MIN_VALUE;
}

/**
 * After a closed-interval draw: if the result equals an exclusive endpoint,
 * step one ulp toward the interior. Does not resample — a truncated
 * distribution's mass on the bound would otherwise loop.
 */
export function constrainContinuous(
  next: () => number,
  min: Bound<number>,
  max: Bound<number>,
): () => number {
  return () => {
    let value = next();
    if (min.exclusive && value === min.value) {
      value = towardInterior(value, max.value);
    }
    if (max.exclusive && value === max.value) {
      value = towardInterior(value, min.value);
    }
    return value;
  };
}

/**
 * A `bigint` end that may be written as a `number`, so a call site needs no
 * `BigInt(...)` where `5n` does not compile. A `number` must be a safe integer:
 * beyond ±2^53 a literal has already rounded before it arrives, so the exact
 * value is only expressible as a `bigint`.
 */
export function toBigintBound(
  label: string,
  end: "min" | "max",
  input: InputBound<bigint | number>,
): Bound<bigint> {
  const bound = toBound(input);
  if (typeof bound.value === "bigint") {
    return { value: bound.value, exclusive: bound.exclusive };
  }
  if (!Number.isSafeInteger(bound.value)) {
    throw new FabricatorError.InvalidBoundError(
      label,
      end,
      bound.value,
      "a bigint, or a number that is a safe integer",
    );
  }
  return { value: BigInt(bound.value), exclusive: bound.exclusive };
}

/**
 * A `Date` end that may be written as epoch milliseconds, as `initialize({
 * clock })` accepts. A `number` must be one a `Date` holds unchanged — the test
 * `Instance/Core.ts`'s `resolveInstant` applies — so a fractional, non-finite,
 * or out-of-range number throws rather than being adjusted the way `Date`'s
 * `TimeClip` would.
 */
export function toDateBound(
  label: string,
  end: "min" | "max",
  input: InputBound<Date | number>,
): Bound<Date> {
  const bound = toBound(input);
  if (bound.value instanceof Date) {
    return { value: bound.value, exclusive: bound.exclusive };
  }
  const date = new Date(bound.value);
  if (date.valueOf() !== bound.value) {
    throw new FabricatorError.InvalidBoundError(
      label,
      end,
      bound.value,
      "a Date, or an integer number of epoch milliseconds within ±8.64e15",
    );
  }
  return { value: date, exclusive: bound.exclusive };
}

export function epochBound(bound: Bound<Date>): Bound<number> {
  return { value: bound.value.getTime(), exclusive: bound.exclusive };
}

/**
 * Call-site `length` for `string` and `array`: a bare number is an exact count,
 * and `{ max, min?, distribution? }` is a range. A scalar end is inclusive.
 */
export type InputLength =
  | number
  | {
      max: InputBound<number>;
      min?: InputBound<number> | undefined;
      distribution?: Distribution | undefined;
    };

/**
 * Stored `length`: both ends are canonical {@link Bound}s. `distribution` is
 * present only when the caller set one, so a bare count and an unspecified
 * distribution stay off the stored object.
 */
export type Length = {
  min: Bound<number>;
  max: Bound<number>;
  distribution?: Distribution | undefined;
};

/**
 * Array/string `length`: a bare number is an exact count (no distribution); an
 * omitted `min` is inclusive `0`. Always stored as a Bound pair so adapters
 * have one path. `distribution` is copied only when the caller set one,
 * matching `date/Registry.ts`'s `toWhereby`, so stored meta stays minimal.
 */
export function toLengthRange(length: InputLength, label: string): Length {
  const range =
    typeof length === "number"
      ? { min: toBound(length), max: toBound(length) }
      : {
          min:
            length.min === undefined
              ? { value: 0, exclusive: false }
              : toBound(length.min),
          max: toBound(length.max),
        };
  assertNonemptyDiscrete(label, range.min, range.max);

  if (typeof length === "number" || length.distribution === undefined) {
    return range;
  }

  return { min: range.min, max: range.max, distribution: length.distribution };
}

/**
 * The ends an adapter states for a schema, as `.admits(...)` stores them. An
 * absent end states no limit. Also the shape of a schema's fabricable range,
 * where an absent end is one drawn against the kind's unbounded cap.
 */
export type AdmittedEnds<$T> = {
  min?: Bound<$T> | undefined;
  max?: Bound<$T> | undefined;
};

/**
 * What `.admits({ min, max })` accepts: an end as `whereby` takes it, or
 * `-Infinity`/`Infinity` (bare, or as a `Bound`'s value) for no limit. An
 * omitted end keeps what is admitted already.
 */
export type InputAdmittedEnds<$T> = {
  min?: InputBound<$T> | undefined;
  max?: InputBound<$T> | undefined;
};

/**
 * Whether every value `inner` admits at one end is one `outer` admits too. Each
 * kind's notion of "admits" differs — a whole-number end excludes by `±1`, a
 * continuous end by its endpoint alone — so each passes its own.
 */
export type Within<$T> = (
  inner: Bound<$T>,
  outer: Bound<$T>,
  end: "min" | "max",
) => boolean;

/**
 * Continuous ends: a farther value, or the same value with `inner` no less
 * exclusive than `outer`.
 */
export const continuousWithin: Within<number> = (inner, outer, end) => {
  if (inner.value === outer.value) return inner.exclusive || !outer.exclusive;
  return end === "min" ? inner.value > outer.value : inner.value < outer.value;
};

/** Whole-number ends, compared as the inclusive integers they leave. */
export const discreteWithin: Within<number> = (inner, outer, end) =>
  end === "min"
    ? discreteEnd(inner, end) >= discreteEnd(outer, end)
    : discreteEnd(inner, end) <= discreteEnd(outer, end);

export const bigintWithin: Within<bigint> = (inner, outer, end) =>
  end === "min"
    ? bigintEnd(inner, end) >= bigintEnd(outer, end)
    : bigintEnd(inner, end) <= bigintEnd(outer, end);

/** `Date` holds whole milliseconds, so its ends compare as discrete epoch ms. */
export const dateWithin: Within<Date> = (inner, outer, end) =>
  discreteWithin(epochBound(inner), epochBound(outer), end);

function discreteEnd(bound: Bound<number>, end: "min" | "max"): number {
  if (!bound.exclusive) return bound.value;
  return end === "min" ? bound.value + 1 : bound.value - 1;
}

function bigintEnd(bound: Bound<bigint>, end: "min" | "max"): bigint {
  if (!bound.exclusive) return bound.value;
  return end === "min" ? bound.value + BigInt(1) : bound.value - BigInt(1);
}

/** A `number` end for `.admits`, where a finite value is required. */
export function toFiniteBound(
  label: string,
  end: "min" | "max",
  input: InputBound<number>,
): Bound<number> {
  const bound = toBound(input);
  if (!Number.isFinite(bound.value)) {
    throw new FabricatorError.InvalidBoundError(
      label,
      end,
      bound.value,
      `a finite number, or ${end === "min" ? "-Infinity" : "Infinity"} for no limit`,
    );
  }
  return bound;
}

/**
 * Resolve one `.admits(...)` group of ends — a length, a size, or a kind's own
 * `min`/`max`. Each end the caller names replaces the current one, `±Infinity`
 * dropping it; each end left out keeps `current`, which is what was admitted
 * before, or the kind's default. Successive calls therefore merge per end.
 *
 * Admitting may only widen what is fabricated, or a fabricated value would fail
 * the validation an adapter builds from these ends: each resolved end must
 * admit every value of `fabricable` at that side, an absent fabricable end
 * (drawn against the kind's unbounded cap) admitting only no limit. A
 * `fabricable` of `undefined` skips the check — under `.as(produce)` there is
 * nothing drawn to compare against. The result is complete and minimal: an end
 * with no limit is left off.
 */
export function toAdmittedEnds<$T, $Input>(
  label: string,
  path: string | undefined,
  current: AdmittedEnds<$T>,
  fabricable: AdmittedEnds<$T> | undefined,
  input: InputAdmittedEnds<$Input> | undefined,
  convert: (end: "min" | "max", input: InputBound<$Input>) => Bound<$T>,
  within: Within<$T>,
): AdmittedEnds<$T> {
  const resolved: AdmittedEnds<$T> = {};

  for (const end of ["min", "max"] as const) {
    const bound = toAdmittedEnd(end, current[end], input?.[end], convert);
    if (bound !== undefined) resolved[end] = bound;
  }

  if (fabricable !== undefined) {
    assertWidens(label, path, resolved, fabricable, within);
  }

  return resolved;
}

function toAdmittedEnd<$T, $Input>(
  end: "min" | "max",
  current: Bound<$T> | undefined,
  given: InputBound<$Input> | undefined,
  convert: (end: "min" | "max", input: InputBound<$Input>) => Bound<$T>,
): Bound<$T> | undefined {
  if (given === undefined) return current;
  if (toBound(given).value === (end === "min" ? -Infinity : Infinity)) {
    return undefined;
  }

  return convert(end, given);
}

function assertWidens<$T>(
  label: string,
  path: string | undefined,
  admitted: AdmittedEnds<$T>,
  fabricable: AdmittedEnds<$T>,
  within: Within<$T>,
): void {
  for (const end of ["min", "max"] as const) {
    const outer = admitted[end];
    if (outer === undefined) continue;
    const inner = fabricable[end];
    if (inner === undefined || !within(inner, outer, end)) {
      throw new FabricatorError.AdmitsExcludesDrawError(
        label,
        path === undefined ? end : `${path}.${end}`,
        outer,
        inner,
      );
    }
  }
}
