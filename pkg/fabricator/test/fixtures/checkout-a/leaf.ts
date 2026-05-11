import { registry as T } from "@ghostry/fabricator";
import type { Constructor } from "@ghostry/fabricator/internal";

/**
 * This directory as a `file://` URL — paired with `checkout-b/leaf.ts`'s own
 * `here` to stand in for two real checkouts at different absolute paths that
 * happen to hold a same-named file at the same relative depth. Real stack
 * frames can't be relocated, so this is what `Attribution.test.ts`'s
 * cross-checkout tests root a source at instead of a synthetic path.
 */
export const here = new URL(".", import.meta.url).href;

/**
 * Constructs `new Fabricator(T.number)` from *this* file and reads its
 * `.trace` back.
 */
export function traceHere(Fabricator: Constructor) {
  return new Fabricator(T.number).trace;
}
