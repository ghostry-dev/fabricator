import { resolveCallerFile } from "@ghostry/fabricator/internal";

/**
 * Stands in for a library that wraps fabricator (e.g. `@ghostry/extern`'s
 * testing scope) and wants a construction attributed to _its own_ caller rather
 * than to this file — the case `resolveCallerFile`'s `skip` option exists for.
 */
const WRAPPER_ROOT = new URL(".", import.meta.url).href;

/**
 * Calls `resolveCallerFile({ skip: [WRAPPER_ROOT], root })` from _this_ file,
 * standing in for a wrapper's own attribution call. Rebuilds the return value
 * as a template string (see `sharedSchema.ts`'s `initializeHere` doc comment)
 * so this function's own frame is never elided from the captured stack under
 * `bun test`.
 */
export function resolveFromWrapper(options?: { root?: string }): string {
  const result = resolveCallerFile({
    skip: [WRAPPER_ROOT],
    ...(options?.root === undefined ? {} : { root: options.root }),
  });
  return `${result}`;
}

/**
 * The contrasting case: calls `resolveCallerFile(options)` from this file with
 * _no_ `skip` — so it resolves no further than this wrapper's own frame, the
 * behavior `skip` exists to see past.
 */
export function resolveFromWrapperUnskipped(options?: {
  root?: string;
}): string {
  const result = resolveCallerFile(options);
  return `${result}`;
}

/**
 * The chained case: calls `resolveCallerFile` with this wrapper's own root
 * _plus_ every root in `outer`, standing in for an integration that is itself
 * called through another library. Every link in the chain has to appear in the
 * skip set — see `test/relay/relay.ts`, which supplies the outer link.
 */
export function resolveFromWrapperChain(
  outer: readonly string[],
  options?: { root?: string },
): string {
  const result = resolveCallerFile({
    skip: [WRAPPER_ROOT, ...outer],
    ...(options?.root === undefined ? {} : { root: options.root }),
  });
  return `${result}`;
}

/**
 * Calls `resolveCallerFile` with an _empty_ skip list, which must behave
 * exactly like omitting `skip`: only fabricator's own frames are excluded, so
 * resolution stops here. Guards the boundary where `skip` went from an optional
 * single root to a list — `[]` is now expressible in a way `undefined` used to
 * be the only spelling for.
 */
export function resolveFromWrapperEmptySkip(options?: {
  root?: string;
}): string {
  const result = resolveCallerFile({
    skip: [],
    ...(options?.root === undefined ? {} : { root: options.root }),
  });
  return `${result}`;
}
