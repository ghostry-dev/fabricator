import {
  continuousWithin,
  discreteWithin,
  toAdmittedEnds,
  toFiniteBound,
  type AdmittedEnds,
} from "../../Bound";
import type { Admits, InputAdmits, Meta } from "./Types";

const label = ".admits on a number schema";

/**
 * Resolve `.admits(...)` against what is admitted already: `meta.admits`, or by
 * default the `whereby` ends — what an adapter states without one. An omitted
 * `whereby` end draws against `±Number.MAX_VALUE` (`±MAX_SAFE_INTEGER` for an
 * integer), so only no limit admits it. `multipleOf` is never checked
 * (`Types.ts`'s `Keywords`).
 */
export function toAdmits(meta: Meta, input: InputAdmits): Admits {
  const stated = { min: meta.whereby?.min, max: meta.whereby?.max };
  const multipleOf = input.multipleOf ?? meta.admits?.multipleOf;
  const ends = toAdmittedEnds(
    label,
    undefined,
    meta.admits ?? stated,
    toFabricable(meta, stated),
    input,
    (end, given) => toFiniteBound(label, end, given),
    meta.integer ? discreteWithin : continuousWithin,
  );

  return multipleOf === undefined ? ends : { ...ends, multipleOf };
}

/**
 * A sequence counts up from 1 without end (`Fabricator.ts`), and under
 * `.as(produce)` nothing is drawn, so nothing is checked.
 */
function toFabricable(
  meta: Meta,
  stated: AdmittedEnds<number>,
): AdmittedEnds<number> | undefined {
  if (meta.produce) return undefined;
  if (meta.sequence) return { min: { value: 1, exclusive: false } };

  return stated;
}
