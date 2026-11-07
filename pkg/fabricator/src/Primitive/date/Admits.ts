import {
  dateWithin,
  toAdmittedEnds,
  toDateBound,
  type AdmittedEnds,
} from "../../Bound";
import type { Admits, InputAdmits, Meta } from "./Types";

const label = ".admits on a date schema";

/**
 * Resolve `.admits(...)` against what is admitted already: `meta.admits`, or by
 * default the `whereby` ends — what an adapter states without one. An omitted
 * `whereby` end draws against `±MAX_TIME`, so only no limit admits it.
 */
export function toAdmits(meta: Meta, input: InputAdmits): Admits {
  const stated = { min: meta.whereby?.min, max: meta.whereby?.max };

  return toAdmittedEnds(
    label,
    undefined,
    meta.admits ?? stated,
    toFabricable(meta, stated),
    input,
    (end, given) => toDateBound(label, end, given),
    dateWithin,
  );
}

/**
 * `past`'s upper end and `future`'s lower end are the clock, unknown until a
 * Fabricator is built, so those sides are treated as unbounded: only no limit
 * admits them. Their input types do not offer that end at all. Under
 * `.as(produce)` nothing is drawn, so nothing is checked.
 */
function toFabricable(
  meta: Meta,
  stated: AdmittedEnds<Date>,
): AdmittedEnds<Date> | undefined {
  if (meta.produce) return undefined;
  if (meta.mode === "past") return { min: stated.min };
  if (meta.mode === "future") return { max: stated.max };

  return stated;
}
