import { Replace } from "../Types";
import { mergeableKeys } from "./Core";
import type { PlainObject, Pretty } from "./Types";

export type ShallowMerge<$A, $B> = $B extends { [Replace]: true }
  ? Pretty<Omit<$B, typeof Replace>>
  : Pretty<Omit<$A, keyof $B> & Omit<$B, typeof Replace>>;

export function shallowMerge<$A extends PlainObject, $B extends PlainObject>(
  a: $A,
  b: $B,
): ShallowMerge<$A, $B> {
  const result: PlainObject = {};

  if (Replace in b && b[Replace] === true) {
    for (const key of mergeableKeys(b)) {
      result[key] = b[key];
    }

    return result as ShallowMerge<$A, $B>;
  }

  for (const key of mergeableKeys(a)) {
    result[key] = a[key];
  }

  for (const key of mergeableKeys(b)) {
    result[key] = b[key];
  }

  return result as ShallowMerge<$A, $B>;
}
