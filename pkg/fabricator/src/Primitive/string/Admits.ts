import {
  discreteWithin,
  toAdmittedEnds,
  toFiniteBound,
  type AdmittedEnds,
} from "../../Bound";
import type { Admits, InputAdmits, Meta } from "./Types";

const label = ".admits on a string schema";

/**
 * Resolve `.admits(...)` against what is admitted already: `meta.admits`, or by
 * default the drawn `length` — what an adapter states without one. Under
 * `.as(produce)` nothing is drawn, so nothing is checked. `format` and
 * `pattern` are never checked (`Types.ts`'s `Keywords`).
 */
export function toAdmits(meta: Meta, input: InputAdmits): Admits {
  const drawn = toEnds(meta.whereby?.length);
  const format = input.format ?? meta.admits?.format;
  const pattern = input.pattern ?? meta.admits?.pattern;

  return {
    ...(format === undefined ? {} : { format }),
    ...(pattern === undefined ? {} : { pattern }),
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
