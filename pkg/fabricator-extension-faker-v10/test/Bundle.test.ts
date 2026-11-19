import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./index.ts";

/**
 * Bundles `entry` the way a browser app would, unminified so each module keeps
 * its path comment. Bun's browser target sets no `node`/`bun` condition, so
 * `#load` resolves to `Load/Unavailable.ts`, as it does in any browser
 * bundler.
 */
async function bundle(entry: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
  });
  expect(result.success).toBe(true);
  return result.outputs[0]!.text();
}

/**
 * A module of faker's own `dist`, named in a bundle's path comments. Faker's
 * package name alone would also match this package's error messages.
 */
const fakerModule = /@faker-js\/faker\/dist\//;

const fixture = (name: string) =>
  new URL(`./fixtures/${name}`, import.meta.url).pathname;

test("the detector finds faker in a bundle that imports it", async () => {
  expect(await bundle(fixture("importsFaker.ts"))).toMatch(fakerModule);
});

test("a bundle that builds and adapts T.faker schemas contains no faker", async () => {
  const output = await bundle(fixture("adaptOnly.ts"));

  expect(output).not.toMatch(fakerModule);
  expect(output).not.toMatch(/createRequire/);
});

test("fabricating in that bundle throws UnloadableError, naming `create`", async () => {
  const output = await bundle(fixture("adaptOnly.ts"));

  const dir = mkdtempSync(join(tmpdir(), "faker-bundle-"));
  try {
    const file = join(dir, "bundle.js");
    writeFileSync(file, output);
    const { Fabricator, User, schema } = await import(file);

    expect(schema.type).toBe("object");

    /**
     * The bundle carries its own copy of the error classes, so the check is by
     * `name`, which identifies an error across copies (`AGENTS.md`'s "Error
     * handling").
     */
    expect(() => new Fabricator(User).fabricate()).toThrow(
      expect.objectContaining({
        name: "@ghostry/fabricator-extension-faker-v10:UnloadableError",
        message: expect.stringContaining("create"),
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
