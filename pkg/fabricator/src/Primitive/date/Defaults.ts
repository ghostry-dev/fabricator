import type { Bound } from "../../Bound";
import { MAX_TIME } from "../../Types";

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
