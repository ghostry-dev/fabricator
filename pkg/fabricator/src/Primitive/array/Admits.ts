import {
  discreteWithin,
  toAdmittedEnds,
  toFiniteBound,
  type AdmittedEnds,
} from "../../Bound";
import type { Admits, InputAdmits, Meta } from "./Types";

const label = ".admits on an array schema";

/**
 * Resolve `.admits(...)` against what is admitted already: `meta.admits`, or by
 * default the drawn `length` — what an adapter states without one. Under
 * `.as(produce)` nothing is drawn, so nothing is checked.
 */
export function toAdmits(meta: Meta, input: InputAdmits): Admits {
  const drawn = toEnds(meta.whereby?.length);

  return {
    length: toAdmittedEnds(
      label,
      "length",
      meta.admits?.length ?? drawn,
      meta.produce ? undefined : drawn,
      input.length,
      (end, given) => toFiniteBound(label, end, given),
      discreteWithin,
    ),
  };
}

function toEnds(
  length: AdmittedEnds<number> | undefined,
): AdmittedEnds<number> {
  if (!length) return {};

  return { min: length.min, max: length.max };
}
