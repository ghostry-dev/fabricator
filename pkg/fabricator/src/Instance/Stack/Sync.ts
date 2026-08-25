import type { Frame, Stack } from "../Types";

/**
 * The synchronous carrier: a private `Frame[]`, pushed on `enter` and popped in
 * a `finally` — correct even around a `throw` from `block`.
 *
 * Selected by the `#stack` `default` condition (`package.json`), i.e. on any
 * runtime without `node:async_hooks` — in practice a browser bundle. Its frame
 * cannot survive an `await`: `enter` returns `block()` without awaiting, so an
 * async block's frame unwinds at the block's first suspension point, and a
 * shared LIFO could not represent two overlapping scopes even if it did await.
 * Both are why `asynchronous` is `false` and `wrap` refuses an async block here
 * rather than resolving it against the base instance with no signal.
 */
export function toStack(): Stack {
  const frames: Frame[] = [];

  return {
    asynchronous: false,

    current: () => frames[frames.length - 1],

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
