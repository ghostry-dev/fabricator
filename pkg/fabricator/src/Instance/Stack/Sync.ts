import type { Frame, Stack } from "../Types";
import { toVisible } from "./Visible";

/**
 * The synchronous carrier: a private `Frame[]`, pushed on `enter` and popped in
 * a `finally` — correct even around a `throw` from `block`. Already in
 * outermost-first order, which is the order `visible` reports, so it hands the
 * array straight to `toVisible` and does no filtering of its own.
 *
 * Selected by the `#stack` `default` condition (`package.json`), i.e. on any
 * runtime without `node:async_hooks` — in practice a browser bundle. Its frame
 * cannot survive an `await`: `enter` returns `block()` without awaiting, so an
 * async block's frame unwinds at the block's first suspension point, and one
 * shared array could not represent two overlapping scopes even if it did await.
 * Both are why `asynchronous` is `false` and `wrap` refuses an async block here
 * rather than resolving it against the base instance with no signal.
 */
export function toStack(): Stack {
  const frames: Frame[] = [];

  return {
    asynchronous: false,

    visible: (ancestry) => toVisible(frames, ancestry),

    enter: (frame, block) => {
      frames.push(frame);
      try {
        return block();
      } finally {
        frames.pop();
      }
    },
  };
}
