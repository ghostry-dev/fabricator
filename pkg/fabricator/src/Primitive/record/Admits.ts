import {
  discreteWithin,
  toAdmittedEnds,
  toFiniteBound,
  type AdmittedEnds,
} from "../../Bound";
import type { Admits, InputAdmits, Meta } from "./Types";

const label = ".admits on a record schema";

/**
 * Resolve `.admits(...)` against what is admitted already: `meta.admits`, or by
 * default the written size ({@link toStatedSize}) — what an adapter states
 * without one. Admitting is checked against what the record can fabricate
 * ({@link toFabricableSize}), which for a plain record differs from what it
 * states. Under `.as(produce)` nothing is drawn, so nothing is checked.
 */
export function toAdmits(meta: Meta, input: InputAdmits): Admits {
  return {
    size: toAdmittedEnds(
      label,
      "size",
      meta.admits?.size ?? toStatedSize(meta),
      meta.produce ? undefined : toFabricableSize(meta),
      input.size,
      (end, given) => toFiniteBound(label, end, given),
      discreteWithin,
    ),
  };
}

/**
 * The count a record states without `.admits`: the bounds written in `whereby`,
 * as written. A unique record's `size` is a range. A plain record's `minTried`
 * counts attempts, not entries, so only `max` is stated. The TypeBox adapter's
 * `toPropertyCount` states the same, and `recursive/Terminate.ts` reads it to
 * see whether an emptied record would break a stated minimum.
 */
export function toStatedSize(meta: Meta): AdmittedEnds<number> {
  if (meta.unique) {
    const { size } = meta.whereby;
    return { min: size.min, max: size.max };
  }
  if (!meta.whereby) return {};

  const { size } = meta.whereby;
  return { max: { value: size.max, exclusive: false } };
}

/**
 * How many entries a fabricated record can hold. A unique record draws its keys
 * distinct, so its drawn `size` is exact. A plain record's colliding keys
 * collapse, so only `size.max` is a real bound: the first attempt always lands,
 * leaving at least one entry when `minTried` is at least 1, and none
 * otherwise.
 */
function toFabricableSize(meta: Meta): AdmittedEnds<number> {
  if (meta.unique || !meta.whereby) return toStatedSize(meta);

  const { size } = meta.whereby;
  return {
    min: { value: (size.minTried ?? 0) >= 1 ? 1 : 0, exclusive: false },
    max: { value: size.max, exclusive: false },
  };
}
