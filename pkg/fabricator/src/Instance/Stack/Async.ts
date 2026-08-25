import { AsyncLocalStorage } from "node:async_hooks";
import type { Frame, Stack } from "../Types";

/**
 * The asynchronous carrier, and the **only** module in this package importing
 * anything from `node:`. Nothing imports it directly: `Instance/Core.ts`
 * imports `#stack`, whose `node`/`bun`/`deno` conditions (`package.json`)
 * resolve here while `default` resolves to `./sync.ts`. That is what keeps the
 * package importable on a runtime with no `node:async_hooks` while every
 * runtime that has one gets async-safe `wrap` with nothing to configure.
 *
 * `AsyncLocalStorage.run` returns whatever `block` returns, so this satisfies
 * `enter`'s sync-preserving `<$Return>` signature exactly as the sync carrier
 * does — a synchronous `wrap` is unaffected by which carrier is in play.
 */
export function toStack(): Stack {
  const store = new AsyncLocalStorage<Frame>();

  return {
    asynchronous: true,

    current: () => store.getStore(),

    enter: (frame, block) => store.run(frame, block),
  };
}
