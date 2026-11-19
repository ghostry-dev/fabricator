import { AsyncLocalStorage } from "node:async_hooks";
import type { Frame, Stack } from "../Types.ts";
import { toVisible } from "./Visible.ts";

/**
 * The asynchronous carrier, and the **only** module in this package importing
 * anything from `node:`. Nothing imports it directly: `src/index.ts` imports
 * `#stack`, whose `node`/`bun` conditions (`package.json`) resolve here while
 * `default` resolves to `./Sync.ts`. That is what keeps the package importable
 * on a runtime with no `node:async_hooks` while every runtime that has one gets
 * async-safe `wrap` with nothing to configure. Deno reaches this file both ways
 * it can install the package: from npm through the `node` condition (built
 * output, under `dist/`), and from JSR through `jsr.json`'s import map, which
 * resolves `#stack` here when the package is published. A `deno` condition in
 * `package.json` would serve both, but npm ships no `src/`.
 *
 * The store holds the whole open chain, not one `Frame`: `run` _replaces_ the
 * store for the duration of `block`, so `enter` rebuilds the chain with the new
 * frame appended. A fresh array per `enter` is also what isolates concurrent
 * `wrap`s — each async context keeps the chain it entered with, and an inner
 * `enter` cannot mutate an outer one's view. Chains are at nesting depth, so
 * copying one costs nothing worth avoiding.
 *
 * `AsyncLocalStorage.run` returns whatever `block` returns, so this satisfies
 * `enter`'s sync-preserving `<$Return>` signature exactly as the sync carrier
 * does — a synchronous `wrap` is unaffected by which carrier is in play.
 */
export function toStack(): Stack {
  const store = new AsyncLocalStorage<ReadonlyArray<Frame>>();

  const getFrames = () => store.getStore() ?? [];

  return {
    asynchronous: true,

    visible: (ancestry) => toVisible(getFrames(), ancestry),

    enter: (frame, block) => store.run([...getFrames(), frame], block),
  };
}
