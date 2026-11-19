/**
 * The loader for runtimes that can load a module synchronously, and the
 * **only** module in this package importing anything from `node:` or loading
 * `@faker-js/faker` as a value. `src/index.ts` reaches it through `#load`,
 * whose `node`/`bun` conditions (`package.json`) resolve here while `default`
 * resolves to `./Unavailable.ts`. That is what keeps faker out of a browser
 * bundle that only builds and adapts schemas, while every runtime that can load
 * it fabricates with nothing to configure. Tests reach it directly, through the
 * private `#internal/Load/Sync` import.
 *
 * No `deno` condition: it would have to name `src/`, which npm does not ship.
 * Deno reaches this file from npm through `node` — Deno accepts the bare
 * `module` specifier rslib emits, inside an npm package — and from JSR through
 * `jsr.json`'s import map, which resolves `#load` at publish.
 *
 * `createRequire`, not `import()`: a producer runs synchronously inside
 * `fabricate()`, so the module has to be in hand when the first faker builder
 * draws. Faker 10 is ESM-only and has no top-level `await`, so `require(esm)`
 * loads it — on Node from 20.19 (faker's own `engines` floor), on Bun, and on
 * Deno.
 *
 * @module
 */

import type * as Faker from "@faker-js/faker";
import { createRequire } from "node:module";

type Load = () => typeof Faker;

const require = createRequire(import.meta.url);

const required: Load = () => require("@faker-js/faker") as typeof Faker;

let intercepted: ((load: Load) => typeof Faker) | undefined;

/** Loads `@faker-js/faker`, through the test interception if one is set. */
export function load(): typeof Faker {
  return intercepted ? intercepted(required) : required();
}

/**
 * Test seam, reached only through the private `#internal/Load/Sync` import:
 * routes every {@link load} through `intercept`, which receives the real loader,
 * so a test can count loads or substitute a module. Returns the function that
 * removes it. One at a time — a test that nests them has a bug, so it throws
 * rather than stacking.
 */
export function interceptLoad(
  intercept: (load: Load) => typeof Faker,
): () => void {
  if (intercepted) throw new Error("interceptLoad is already active.");
  intercepted = intercept;
  return () => {
    intercepted = undefined;
  };
}
