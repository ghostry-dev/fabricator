import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/esm/", import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".js") ? [full] : [];
  });
}

/**
 * Every `from "…"` in the emitted output whose specifier is neither relative
 * nor a `#` subpath import — i.e. everything the package expects the host to
 * provide.
 */
function externalImports(source: string): string[] {
  return [...source.matchAll(/\bfrom\s*"([^"]+)"/g)]
    .map((match) => match[1]!)
    .filter(
      (specifier) => !specifier.startsWith(".") && !specifier.startsWith("#"),
    );
}

/**
 * The package must stay importable on a runtime with no `node:async_hooks` —
 * that is the whole premise of `#stack`'s `default` condition resolving to the
 * synchronous carrier (`Instance/Stack/Sync.ts`). A `node:` import anywhere
 * else in the graph would break that silently: the failure is a module-load
 * error in someone else's browser bundle, which no test here would otherwise
 * catch.
 *
 * Asserted against built output rather than source because that is what ships,
 * and because rslib rewrites the specifier on the way out — `node:async_hooks`
 * is emitted as a bare `async_hooks`, which Node and Bun both resolve to the
 * builtin. Deno, which does require the prefix, is served `src/` by its own
 * `#stack` condition and never reads this file.
 */
test("only the async carrier imports anything the host has to provide", () => {
  const offenders = walk(DIST)
    .map(
      (file) =>
        [
          file.slice(DIST.length),
          externalImports(readFileSync(file, "utf8")),
        ] as const,
    )
    .filter(([, imports]) => imports.length > 0);

  expect(Object.fromEntries(offenders)).toEqual({
    "Instance/Stack/Async.js": ["async_hooks"],
  });
});
