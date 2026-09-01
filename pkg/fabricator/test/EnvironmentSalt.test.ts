import { initialize } from "@ghostry/fabricator";
import { toRandomSource } from "@ghostry/fabricator/internal";
import { afterEach, expect, test } from "bun:test";

/**
 * The one variable `envSalt` (`Random/index.ts`) consults, plus the names it
 * deliberately does not — cleared alike so a stray export in the surrounding
 * environment can't decide the result either way.
 */
const VARIABLES = [
  "FABRICATOR_SALT",
  "FABRICATOR_SEED",
  "SEED",
  "RANDOM_SEED",
] as const;

/**
 * Read the salt an unconfigured source resolves to. `toRandomSource` is the
 * narrowest public route to `normalizeSalt`, which is where the environment is
 * consulted — and only when no `salt` is supplied at all.
 */
const resolved = (): ReadonlyArray<string> => toRandomSource({ clock: 0 }).salt;

afterEach(() => {
  for (const variable of VARIABLES) delete process.env[variable];
});

test("an omitted salt with no environment variables set stays empty", () => {
  expect(resolved()).toEqual([]);
});

test("FABRICATOR_SALT supplies the salt when none is passed", () => {
  process.env["FABRICATOR_SALT"] = "from-env";

  expect(resolved()).toEqual(["from-env"]);
});

/**
 * The old name is gone, not aliased. Nothing reads it, so a stale
 * `FABRICATOR_SEED` in a shell or CI config fails loudly by having no effect
 * rather than silently pinning a run.
 */
test("FABRICATOR_SEED is no longer consulted", () => {
  process.env["FABRICATOR_SEED"] = "stale";

  expect(resolved()).toEqual([]);
});

/**
 * The conventional names are deliberately not read. Whoever exports one is
 * asking for a stable run, which a salt alone cannot deliver — `clock` still
 * varies per process — so honoring them would look like it worked while the
 * data kept moving. See `envSalt`'s own comment.
 */
test("the conventional SEED and RANDOM_SEED names are not consulted", () => {
  process.env["SEED"] = "conventional";
  process.env["RANDOM_SEED"] = "also-conventional";

  expect(resolved()).toEqual([]);
});

test("FABRICATOR_SALT applies even when the conventional names are set", () => {
  process.env["FABRICATOR_SALT"] = "ours";
  process.env["SEED"] = "theirs";
  process.env["RANDOM_SEED"] = "theirs-too";

  expect(resolved()).toEqual(["ours"]);
});

/**
 * The environment is a fallback for an _omitted_ salt, never a mixer composed
 * onto a supplied one — otherwise an explicitly salted fixture would move
 * whenever the surrounding run set a variable, which is the one thing a bare
 * salt exists to prevent.
 */
test("an explicit salt ignores the environment entirely", () => {
  process.env["FABRICATOR_SALT"] = "from-env";

  expect(toRandomSource({ salt: "explicit", clock: 0 }).salt).toEqual([
    "explicit",
  ]);
});

/**
 * An explicit empty array is a supplied salt, not a missing one — `undefined`
 * is the only thing that reaches the environment.
 */
test("an explicitly empty salt is not treated as omitted", () => {
  process.env["FABRICATOR_SALT"] = "from-env";

  expect(toRandomSource({ salt: [], clock: 0 }).salt).toEqual([]);
});

/**
 * The caveat the variable exists alongside, and the reason the conventional
 * names above are not read: pinning the salt pins only the salt. `clock` still
 * captures wall-clock time, so the run still moves. A `"derived"` clock would
 * be drawn across the whole representable `Date` span and land nowhere near
 * now, which is what makes the two cases distinguishable here.
 */
test("FABRICATOR_SALT pins the salt without pinning the clock", () => {
  process.env["FABRICATOR_SALT"] = "from-env";

  const before = Date.now();
  const instance = initialize();
  const after = Date.now();

  expect(instance.salt).toEqual(["from-env"]);
  expect(instance.context.clock).toBeGreaterThanOrEqual(before);
  expect(instance.context.clock).toBeLessThanOrEqual(after);
});
