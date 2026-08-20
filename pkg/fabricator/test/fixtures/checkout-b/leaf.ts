import { registry as T } from "@ghostry/fabricator";
import type { Constructor } from "@ghostry/fabricator/internal";

/**
 * This directory as a `file://` URL — the `checkout-a/leaf.ts` counterpart. See
 * that file's own doc comment for why this pair exists.
 */
export const here = new URL(".", import.meta.url).href;

/**
 * Constructs `new Fabricator(T.number)` from _this_ file and reads its `.trace`
 * back — see `checkout-a/leaf.ts`'s `traceHere`.
 */
export function traceHere(Fabricator: Constructor) {
  return new Fabricator(T.number).trace;
}
