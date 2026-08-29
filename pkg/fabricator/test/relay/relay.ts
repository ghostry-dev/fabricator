import { resolveFromWrapperChain } from "../fixtures/wrapper";

/**
 * The _outer_ link of a two-wrapper chain, deliberately in its own directory:
 * `test/fixtures/` and `test/relay/` are siblings, so neither root is a prefix
 * of the other and skipping one cannot incidentally skip the other. A fixture
 * nested under `test/fixtures/` would be covered by the wrapper's own root and
 * could not tell a one-root skip from a two-root one.
 *
 * Stands in for `@ghostry/extern` relaying through its fabricator extension:
 * the captured stack reads fabricator → wrapper → relay → caller.
 */
const RELAY_ROOT = new URL(".", import.meta.url).href;

/**
 * Relays to the wrapper with this file's root added to the skip set, so
 * resolution should pass both wrappers and land on the original caller.
 * Rebuilds the return value as a template string (see `fixtures/wrapper.ts`) so
 * this function's own frame is never elided under `bun test`.
 */
export function relayToWrapper(options?: { root?: string }): string {
  const result = resolveFromWrapperChain([RELAY_ROOT], options);
  return `${result}`;
}

/**
 * The contrasting case: relays with an _empty_ outer skip set, so only the
 * wrapper's own root is excluded and resolution stops here, at this file.
 */
export function relayToWrapperUnskipped(options?: { root?: string }): string {
  const result = resolveFromWrapperChain([], options);
  return `${result}`;
}
