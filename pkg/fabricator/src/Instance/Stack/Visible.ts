import type { Ancestry, Frame, Stack } from "../Types";

/**
 * Whether `reader` is `receiver` or one of its ancestors — `reader`'s chain a
 * prefix of `receiver`'s.
 */
function governs(receiver: Ancestry, reader: Ancestry): boolean {
  if (reader.length > receiver.length) return false;
  for (let index = 0; index < reader.length; index++) {
    if (reader[index] !== receiver[index]) return false;
  }
  return true;
}

/**
 * The frames in `frames` that `ancestry` may resolve against, outermost first —
 * the single definition of {@link Stack.visible}'s rule, which both carriers
 * delegate to so neither can drift from the other. A carrier's own job is
 * reduced to holding the chain in whatever way its runtime allows.
 *
 * A wrap governs the instance it was called on and that instance's ancestors,
 * never its descendants: `governs` is a prefix test in that one direction.
 * Order is preserved rather than reduced to the innermost match, because the
 * count is `context.depth` and the innermost is just the last element.
 *
 * It filters the whole chain rather than walking in from the innermost frame
 * and stopping at the first that does not govern the reader, because a
 * governing frame can sit beneath one that does not: with `B`'s wrap open and
 * `C`'s nested inside it, `B` must pass over `C`'s frame and still resolve
 * against its own.
 */
export function toVisible(
  frames: ReadonlyArray<Frame>,
  ancestry: Ancestry,
): ReadonlyArray<Frame> {
  return frames.filter((frame) => governs(frame.ancestry, ancestry));
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
