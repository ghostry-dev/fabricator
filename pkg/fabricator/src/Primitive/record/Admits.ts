import {
  discreteWithin,
  toAdmittedEnds,
  toFiniteBound,
  type AdmittedEnds,
} from "../../Bound";
import type {
  Admits,
  InputAdmits,
  Meta,
  UniqueWhereby,
  Whereby,
} from "./Types";

const label = ".admits on a record schema";

/**
 * Resolve `.admits(...)` against what is admitted already: `meta.admits`, or by
 * default the fabricable size ({@link toFabricableSize}) — what an adapter
 * states without one. Under `.as(produce)` an adapter states no count and
 * nothing is checked.
 */
export function toAdmits(meta: Meta, input: InputAdmits): Admits {
  const fabricable = meta.produce ? undefined : toFabricableSize(meta);

  return {
    size: toAdmittedEnds(
      label,
      "size",
      meta.admits?.size ?? fabricable ?? {},
      fabricable,
      input.size,
      (end, given) => toFiniteBound(label, end, given),
      discreteWithin,
    ),
  };
}

/**
 * How many entries a fabricated record can hold. A unique record draws its keys
 * distinct, so its drawn `size` is exact. A plain record's colliding keys
 * collapse, so only `size.max` is a real bound: the first attempt always lands,
 * leaving at least one entry when `minTried` is at least 1, and none otherwise.
 * The TypeBox adapter's `toPropertyCount` states the same range.
 */
export function toFabricableSize(meta: Meta): AdmittedEnds<number> | undefined {
  if (!meta.whereby) return undefined;
  if (meta.unique) {
    const { size } = meta.whereby as UniqueWhereby;
    return { min: size.min, max: size.max };
  }

  const { size } = meta.whereby as Whereby;
  return {
    min: { value: (size.minTried ?? 0) >= 1 ? 1 : 0, exclusive: false },
    max: { value: size.max, exclusive: false },
  };
}
