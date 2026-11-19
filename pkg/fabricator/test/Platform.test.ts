import { expect, test } from "./index.ts";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  /**
   * `\s+`, not `\s*`: ESM `from` specifiers always have whitespace before the
   * quote (`from "async_hooks"`), and `\s*` would also match a string literal
   * `"from"` used as a structural path segment (`derive`'s `from` slots).
   */
  return [...source.matchAll(/\bfrom\s+"([^"]+)"/g)]
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
 * builtin. Deno accepts the bare specifier inside an npm package, so a Deno
 * consumer of the npm package reads this file through the `node` condition. A
 * JSR consumer never does: `jsr.json`'s import map resolves `#stack` to source
 * when the package is published.
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

const ROOT = new URL("../", import.meta.url).pathname;

const manifest = (name: string) =>
  JSON.parse(readFileSync(join(ROOT, name), "utf8")) as {
    files?: string[];
    imports?: Record<string, string | Record<string, string>>;
  };

/**
 * The npm tarball ships `files` alone (`dist`), and every runtime that reads it
 * — Deno included, since Deno resolves an npm package's `imports` with the
 * `deno` condition first — follows `package.json`'s `imports`. So every runtime
 * target there must name a shipped file. `types` is the exception: it serves
 * this repo's own type-check, and no emitted declaration imports `#stack`. A
 * `deno` condition pointing at `src/` is the case this exists for: it fails to
 * load under Deno from npm, while JSR, which ships `src/`, is served by
 * `jsr.json`'s import map instead.
 */
test("every runtime target of package.json's imports is in the npm tarball", () => {
  const { files = [], imports = {} } = manifest("package.json");

  const targets = Object.entries(imports).flatMap(([specifier, target]) =>
    typeof target === "string"
      ? [[specifier, "default", target] as const]
      : Object.entries(target)
          .filter(([condition]) => condition !== "types")
          .map(([condition, path]) => [specifier, condition, path] as const),
  );

  const unshipped = targets.filter(
    ([, , path]) =>
      !files.some((file) => path.replace(/^\.\//, "").startsWith(`${file}/`)),
  );

  expect(unshipped).toEqual([]);
});

/**
 * JSR ships source and resolves a `#` specifier once, at publish, through
 * `jsr.json`'s import map. Each must name a source file, or the published
 * package imports one that is not in it (`check:jsr` rejects that too).
 */
test("jsr.json maps every `#` import to a source file", () => {
  const { imports = {} } = manifest("package.json");
  const { imports: mapped = {} } = manifest("jsr.json");

  expect(Object.keys(mapped).sort()).toEqual(Object.keys(imports).sort());
  for (const path of Object.values(mapped)) {
    expect(typeof path === "string" && path.startsWith("./src/")).toBe(true);
    expect(existsSync(join(ROOT, path as string))).toBe(true);
  }
});
