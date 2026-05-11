import { Replace } from "../Types";
import { isPlainObject, mergeableKeys } from "./Core";
import type { PlainObject, Pretty } from "./Types";

export type DeepMerge<$A, $B> = $B extends { [Replace]: true }
  ? Pretty<Omit<$B, typeof Replace>>
  : Pretty<{
      [$K in Exclude<keyof $A | keyof $B, typeof Replace>]: $A extends {
        [_ in $K]?: infer $AV;
      }
        ? $B extends { [_ in $K]?: infer $BV }
          ? $AV extends PlainObject
            ? $BV extends PlainObject
              ? DeepMerge<$AV, $BV>
              : $BV
            : $BV
          : $AV
        : $B extends { [_ in $K]?: infer $BV }
          ? $BV
          : never;
    }>;

export function deepMerge<$A extends PlainObject, $B extends PlainObject>(
  a: $A,
  b: $B,
): DeepMerge<$A, $B> {
  const result: PlainObject = {};

  if (Replace in b && b[Replace] === true) {
    for (const key of mergeableKeys(b)) {
      result[key] = b[key];
    }

    return result as DeepMerge<$A, $B>;
  }

  for (const key of mergeableKeys(a)) {
    result[key] = a[key];
  }

  for (const key of mergeableKeys(b)) {
    const bValue = b[key];
    const aValue = result[key];

    if (isPlainObject(aValue) && isPlainObject(bValue)) {
      result[key] = deepMerge(aValue, bValue);
    } else {
      result[key] = bValue;
    }
  }

  return result as DeepMerge<$A, $B>;
}
