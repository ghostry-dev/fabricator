import type { Ancestry, Frame, Stack } from "../Types";

/**
 * Whether two instances stand in a _direct_ line — either chain a prefix of the
 * other, so one is an ancestor of (or identical to) the other. "Direct" in the
 * genealogical sense, and the distinction is the whole point: collateral
 * relatives are excluded, so divergence at any position means siblings, or
 * cousins, or two unrelated lineages, and calls on any of those three resolve
 * against their own configuration rather than the other's.
 *
 * Comparing in _both_ directions is what makes it symmetric: a parent's calls
 * resolve against a frame entered on its child (the reader's chain is the
 * prefix), and a child's calls against a frame entered on its parent (the
 * frame's chain is). Only the shorter length is walked, since a prefix relation
 * is decided entirely within it, and tokens compare by identity.
 */
function onDirectLine(a: Ancestry, b: Ancestry): boolean {
  const shared = Math.min(a.length, b.length);

  for (let index = 0; index < shared; index++) {
    if (a[index] !== b[index]) return false;
  }

  return true;
}

/**
 * The frames in `frames` that `ancestry` may resolve against, outermost first —
 * the single definition of {@link Stack.visible}'s rule, which both carriers
 * delegate to so neither can drift from the other. A carrier's own job is
 * reduced to holding the chain in whatever way its runtime allows.
 *
 * Order is preserved rather than reduced to the innermost match, because the
 * count is `context.depth` and the innermost is just the last element.
 * Skipping, rather than stopping at, the first invisible frame is the outward
 * walk: with a parent's `wrap` open and a child's nested inside it, that
 * child's sibling must pass over the inner frame and still resolve against the
 * outer one.
 */
export function toVisible(
  frames: ReadonlyArray<Frame>,
  ancestry: Ancestry,
): ReadonlyArray<Frame> {
  return frames.filter((frame) => onDirectLine(frame.ancestry, ancestry));
}

/**
 * The one frame a read resolves against: the innermost frame visible to
 * `ancestry`, or `undefined` outside any. Every consumer — `resolveScope`,
 * `effectiveSource`, the `context` getters — goes through here rather than
 * indexing `visible()` itself, so "innermost visible" has one definition.
 */
export function toInnermostFrame(
  stack: Stack,
  ancestry: Ancestry,
): Frame | undefined {
  const frames = stack.visible(ancestry);

  return frames[frames.length - 1];
}
