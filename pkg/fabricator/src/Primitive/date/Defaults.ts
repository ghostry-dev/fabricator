import { effectiveDiscrete, epochBound, type Bound } from "../../Bound";
import { MAX_TIME } from "../../Types";
import type { Meta } from "./Types";

/**
 * Inclusive epoch-millisecond caps that a missing `whereby` end draws against —
 * the whole representable `Date` range. Not stored on `[Meta]`: an omitted end
 * stays omitted, and adapters forward only the ends that were named. `past` and
 * `future` fill their one open end from here too.
 */
export const unboundedEpoch: { min: Bound<number>; max: Bound<number> } = {
  min: { value: -MAX_TIME, exclusive: false },
  max: { value: MAX_TIME, exclusive: false },
};

/**
 * The epoch-millisecond ends a `date` draws between, given the construction's
 * `clock`: `whereby`'s named ends, the unbounded caps for the rest, and `clock`
 * itself (inclusive) as `past`'s upper or `future`'s lower end. Here rather
 * than in `Fabricator.ts` so `Unique/Distinct.ts` can read a collection
 * member's range without importing a Fabricator.
 */
export function toEpochBounds(
  meta: Meta,
  clock: number,
): { min: Bound<number>; max: Bound<number> } {
  const whereby = meta.whereby;
  const min = whereby?.min ? epochBound(whereby.min) : unboundedEpoch.min;
  const max = whereby?.max ? epochBound(whereby.max) : unboundedEpoch.max;
  const now = { value: clock, exclusive: false };

  if (meta.mode === "past") return { min, max: now };
  if (meta.mode === "future") return { min: now, max };
  return { min, max };
}

/**
 * {@link toEpochBounds} as the inclusive whole-millisecond interval a `Date` can
 * actually take — `Date` is `TimeClip`ped to whole milliseconds, so this is
 * every value a draw can produce.
 */
export function toEpochRange(
  meta: Meta,
  clock: number,
): { min: number; max: number } {
  const { min, max } = toEpochBounds(meta, clock);
  return effectiveDiscrete(min, max);
}
