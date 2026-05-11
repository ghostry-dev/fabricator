import { FabricatorError } from "./Error";
import { isPlainObject } from "./Utility/Core";

/**
 * Canonical endpoint stored on `[Meta].whereby`. Call sites still accept a
 * scalar (inclusive) via {@link InputBound}; `.whereby()` runs {@link toBound}
 * so adapters always see this shape — never a scalar/object union.
 */
export type Bound<$T> = { value: $T; exclusive: boolean };

/**
 * What `.whereby({ min, max })` accepts: a scalar is inclusive, an object
 * names an endpoint policy. `exclusive` is required on the object form so
 * that form exists only to state one.
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
 * Inclusive integer interval implied by a discrete Bound pair. Exclusive min
 * is `value + 1`, exclusive max is `value - 1` — the same unit the length/
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
 * Sampling still uses the closed interval and {@link constrainContinuous}
 * steps off an exclusive endpoint — this check is what makes that step
 * always have somewhere to land.
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
 * One ulp toward `toward` from `value`. Approximate, and enough to leave
 * an exclusive endpoint without rejection-looping a truncated distribution
 * that clamped onto it.
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

export function epochBound(bound: Bound<Date>): Bound<number> {
  return { value: bound.value.getTime(), exclusive: bound.exclusive };
}

/**
 * Array/string `length`: a bare number is an exact count; an omitted `min`
 * is inclusive `0`. Always stored as a Bound pair so adapters have one path.
 */
export function toLengthRange(
  length:
    number | { max: InputBound<number>; min?: InputBound<number> | undefined },
  label: string,
): { min: Bound<number>; max: Bound<number> } {
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
  return range;
}
