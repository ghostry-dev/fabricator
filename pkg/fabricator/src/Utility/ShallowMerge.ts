import { Replace } from "../Types.ts";
import type { Pretty } from "./Types.ts";

/**
 * The definition an `object` schema's `.extend()`/`.refine()` produces: each
 * field of `$B` replaces the one of the same key in `$A` wholesale. Type only:
 * at runtime that is `object/Stages.ts`.
 */
export type ShallowMerge<$A, $B> = $B extends { [Replace]: true }
  ? Pretty<Omit<$B, typeof Replace>>
  : Pretty<Omit<$A, keyof $B> & Omit<$B, typeof Replace>>;
