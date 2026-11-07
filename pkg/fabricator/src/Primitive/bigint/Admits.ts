import { bigintWithin, toAdmittedEnds, toBigintBound } from "../../Bound";
import type { Admits, InputAdmits, Meta } from "./Types";

const label = ".admits on a bigint schema";

/**
 * Resolve `.admits(...)` against what is admitted already: `meta.admits`, or by
 * default the drawn range — what an adapter states without one. Under
 * `.as(produce)` nothing is drawn, so nothing is checked.
 */
export function toAdmits(meta: Meta, input: InputAdmits): Admits {
  const drawn = meta.whereby
    ? { min: meta.whereby.min, max: meta.whereby.max }
    : {};

  return toAdmittedEnds(
    label,
    undefined,
    meta.admits ?? drawn,
    meta.produce ? undefined : drawn,
    input,
    (end, given) => toBigintBound(label, end, given),
    bigintWithin,
  );
}
