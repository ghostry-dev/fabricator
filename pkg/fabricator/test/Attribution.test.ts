import { FabricatorError, initialize, layer } from "@ghostry/fabricator";
import { toStreamFromTrace } from "@ghostry/fabricator/internal";
import { expect, test } from "bun:test";
import * as checkoutA from "./fixtures/checkout-a/leaf";
import * as checkoutB from "./fixtures/checkout-b/leaf";
import {
  fabricateSharedSchemaHere,
  initializeHere,
  sharedSchema,
  toRandomSourceHere,
  traceSharedSchemaHere,
} from "./fixtures/sharedSchema";

/**
 * The property `{ kind: "rooted" }` exists for: two sources rooted at different
 * absolute paths — standing in for the same checkout on two different machines
 * — derive the same seed for the same file, as long as the file's position
 * _relative to its own root_ is the same. Real stack frames can't be relocated,
 * so this is demonstrated with two real fixture directories
 * (`fixtures/checkout-a`, `fixtures/checkout-b`) instead of one: each holds a
 * same-shaped `leaf.ts` at the same relative depth, so rooting an instance at
 * each fixture's own directory and building from it stands in for the same file
 * on two different checkouts.
 */
test("rooted attribution reproduces the same seed across different absolute checkouts", () => {
  const instanceA = initialize({
    seed: "cross-checkout",
    clock: "seeded",
    attribution: { kind: "rooted", root: checkoutA.here },
  });
  const instanceB = initialize({
    seed: "cross-checkout",
    clock: "seeded",
    attribution: { kind: "rooted", root: checkoutB.here },
  });

  const a = checkoutA.traceHere(instanceA.Fabricator);
  const b = checkoutB.traceHere(instanceB.Fabricator);

  expect(a?.file).toBe("leaf.ts");
  expect(a).toEqual(b);
});

test("rooted attribution still diverges when the relative path actually differs", () => {
  const instanceA = initialize({
    seed: "cross-checkout",
    clock: "seeded",
    attribution: { kind: "rooted", root: checkoutA.here },
  });
  const instanceB = initialize({
    seed: "cross-checkout",
    clock: "seeded",
    // Rooted one directory higher than `checkout-b`'s own, so its `leaf.ts`
    // resolves as `checkout-b/leaf.ts` rather than bare `leaf.ts` — the same
    // file name, a genuinely different relative path.
    attribution: { kind: "rooted", root: new URL("..", checkoutB.here).href },
  });

  const a = checkoutA.traceHere(instanceA.Fabricator);
  const b = checkoutB.traceHere(instanceB.Fabricator);

  expect(a?.file).not.toBe(b?.file);
  expect(a).not.toEqual(b);
});

test("fork() propagates the resolved attribution policy, not the caller-facing form", () => {
  const parent = toRandomSourceHere("fork-attribution");
  const child = parent.fork("child-seed");

  const root = child.toRoot("attributed");
  toStreamFromTrace(child.algorithm, { ...root, path: [], kind: "number" });

  expect(root.file).toBe("../Attribution.test.ts");
});

test("the default attribution policy is call site, relativized to this file", () => {
  const { T, Fabricator } = initialize({ seed: "default-attribution" });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }));

  expect(built.trace.file).toBe("Attribution.test.ts");
});

test("a rooted policy accepts a file:// URL root and decodes it", () => {
  const { T, Fabricator } = initialize({
    seed: "rooted-url",
    attribution: { kind: "rooted", root: new URL("..", import.meta.url).href },
  });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }));

  expect(built.trace.file).toBe("test/Attribution.test.ts");
});

test("a construction in another file relativizes under this file's default call-site root", () => {
  const { Fabricator } = initialize({ seed: "ascent-here" });

  expect(traceSharedSchemaHere(Fabricator)?.file).toBe(
    "fixtures/sharedSchema.ts",
  );
});

/**
 * `initializeHere()` calls `initialize()` from `test/fixtures/`, so its
 * resolved call-site root is that directory — a sibling of, not an ancestor of,
 * wherever _this_ test file lives. A construction written here therefore falls
 * outside that root and must ascend with `..` rather than fall back to an
 * absolute path, which would silently reintroduce machine-dependence.
 */
test("a construction outside the resolved root ascends with .. rather than staying absolute", () => {
  const { T, Fabricator } = initializeHere();
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }));

  expect(built.trace.file).toBe("../Attribution.test.ts");
});

test("none attributes nothing, so two independent instances draw identical data from a shared seed", () => {
  const instanceA = initialize({
    seed: "none-mode",
    clock: "seeded",
    attribution: { kind: "none" },
  });
  const hereA = fabricateSharedSchemaHere(instanceA.Fabricator);

  const instanceB = initialize({
    seed: "none-mode",
    clock: "seeded",
    attribution: { kind: "none" },
  });
  const thereB = new instanceB.Fabricator(sharedSchema()).fabricate();

  expect(hereA).toEqual(thereB);
});

test("none produces a trace with no file", () => {
  const { T, Fabricator } = initialize({
    seed: "none-trace",
    attribution: { kind: "none" },
  });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }));

  expect(built.trace.file).toBeUndefined();
});

/**
 * Under `{ kind: "none" }`, every construction shares one file-less bucket — so
 * unlike a real file's counter, the _n_th construction anywhere in the instance
 * gets the _n_th index. Distinct constructions must still diverge (never draw
 * identical data), and an explicitly seeded `new Fabricator(schema, { seed })`
 * — which forks away from that shared bucket entirely — must still reproduce
 * exactly regardless of how many ordinary, unseeded constructions ran before or
 * between the two seeded calls.
 */
test("none + an explicitly seeded Fabricator still reproduces amid unseeded builds", () => {
  const { T, Fabricator } = initialize({
    seed: "none-interleave",
    attribution: { kind: "none" },
  });

  new Fabricator(T.number).fabricate();
  new Fabricator(T.number).fabricate();

  const a = new Fabricator(T.object({ x: T.number }), {
    seed: "pinned",
  }).fabricate();

  new Fabricator(T.number).fabricate();

  const b = new Fabricator(T.object({ x: T.number }), {
    seed: "pinned",
  }).fabricate();

  expect(a).toEqual(b);
});

test("none still diverges between two ordinary, unseeded constructions", () => {
  const { T, Fabricator } = initialize({
    seed: "none-diverge",
    attribution: { kind: "none" },
  });

  const a = new Fabricator(T.number).fabricate();
  const b = new Fabricator(T.number).fabricate();

  expect(a).not.toBe(b);
});

/**
 * `T.recursive`'s own top-level dispatch is an ordinary `"attributed"` draw
 * like any other leaf — relativized under a rooted policy exactly the same way.
 * Its _inner_ expansions (`recursive/Fabricator.ts`) key off a private forked
 * source instead, entirely independent of file attribution; that isolation is
 * covered by `Recursive.test.ts`, not here.
 */
test("T.recursive's own dispatch is relativized under a rooted policy", () => {
  const { T, Fabricator } = initialize({
    seed: "recursive-attribution",
    attribution: { kind: "rooted", root: new URL("..", import.meta.url).href },
  });

  const schema = T.recursive((self) =>
    T.object({ children: T.array(self).whereby({ length: { max: 1 } }) }),
  ).whereby({ depth: { max: 1 } });

  const built = new Fabricator(schema);
  expect(built.trace.file).toBe("test/Attribution.test.ts");
});

test("a relative rooted root throws InvalidAttributionRootError", () => {
  expect(() =>
    initialize({ attribution: { kind: "rooted", root: "relative/path" } }),
  ).toThrow(FabricatorError.InvalidAttributionRootError);
});

/**
 * Two constructions in the same file, by default, get different indices — this
 * is what keeps `new Fabricator(schema)` called twice from the same spot from
 * silently handing back identical data.
 */
test("two constructions in the same file diverge from each other by default", () => {
  const { T, Fabricator } = initialize({ seed: "same-file-diverge" });

  const a = new Fabricator(T.number).fabricate();
  const b = new Fabricator(T.number).fabricate();

  expect(a).not.toBe(b);
});

/**
 * The property file attribution actually earns its keep for: a file's data is
 * the same whether that file's constructions run alone or interleaved with
 * unrelated constructions from other files. Positional/dispatch-order keying
 * (the old per-`(file, kind)` counter) could not offer this at the leaf level;
 * per-file construction indices still can at the construction level, since a
 * _different_ file's constructions never touch this file's counter.
 */
test("a file's data is unaffected by unrelated constructions in another file", () => {
  const alone = () => {
    const { T, Fabricator } = initialize({
      seed: "invocation-independence",
      clock: "seeded",
    });
    return [
      new Fabricator(T.number).fabricate(),
      new Fabricator(T.number).fabricate(),
    ];
  };

  const interleaved = () => {
    const { T, Fabricator } = initialize({
      seed: "invocation-independence",
      clock: "seeded",
    });
    const first = new Fabricator(T.number).fabricate();
    fabricateSharedSchemaHere(Fabricator);
    const second = new Fabricator(T.number).fabricate();
    return [first, second];
  };

  expect(interleaved()).toEqual(alone());
});

/**
 * `options.seed` forks an entirely fresh source from exactly that value,
 * ignoring the instance's own seed — the same seed reproduces the same result
 * regardless of which file it's called from, or which instance built it, _given
 * the same clock_ — a per-call seed forks the source but keeps whichever clock
 * the source it forks from already carries (see `Fabricator/Constructor.ts`'s
 * `toConstructionContext`), so two instances must also agree on their clock for
 * this to hold. Pinned explicitly here so the two instances'
 * otherwise-independent default wall-clock instants don't introduce a second,
 * unrelated source of divergence. `"seeded"` would do the same job here; a
 * pinned Date makes the shared "now" obvious.
 */
test("new Fabricator(schema, { seed }) reproduces regardless of the instance's own seed, given the same clock", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const a = initialize({ seed: "instance-a", clock });
  const b = initialize({ seed: "instance-b", clock });

  const one = new a.Fabricator(a.T.number, { seed: "shared" }).fabricate();
  const two = new b.Fabricator(b.T.number, { seed: "shared" }).fabricate();

  expect(one).toBe(two);
});

/**
 * `seed: layer(...)` composes onto the instance's own seed rather than
 * replacing it — equivalent to a bare `{ seed }` fork of exactly
 * `[...instance.seed, ...given]`, not of `given` alone.
 */
test("new Fabricator(schema, { seed: layer(...) }) composes onto the instance's seed", () => {
  const { T, Fabricator, seed } = initialize({ seed: "composing-base" });

  const layered = new Fabricator(T.number, { seed: layer("x") }).fabricate();
  const equivalent = new Fabricator(T.number, {
    seed: [...seed, "x"],
  }).fabricate();

  expect(layered).toBe(equivalent);
});

/**
 * The whole reason the layered form exists: unlike a bare `{ seed }`, which
 * ignores the instance entirely, a layered seed still varies when the instance
 * itself is reseeded.
 */
test("new Fabricator(schema, { seed: layer(...) }) still varies when the instance is reseeded", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const a = initialize({ seed: "instance-a", clock });
  const b = initialize({ seed: "instance-b", clock });

  const one = new a.Fabricator(a.T.number, { seed: layer("x") }).fabricate();
  const two = new b.Fabricator(b.T.number, { seed: layer("x") }).fabricate();

  expect(one).not.toBe(two);
});

/**
 * A layered seed still forks a fully isolated source, exactly like a bare one —
 * so it reproduces across files/instances given the same effective (instance
 * seed + layered seed) pair, and differs from the bare form given the same
 * layered value alone.
 */
test("new Fabricator(schema, { seed: layer(...) }) reproduces given the same instance and layer", () => {
  const a = initialize({ seed: "shared-instance-seed", clock: "seeded" });
  const b = initialize({ seed: "shared-instance-seed", clock: "seeded" });

  const one = new a.Fabricator(a.T.number, { seed: layer("x") }).fabricate();
  const two = new b.Fabricator(b.T.number, { seed: layer("x") }).fabricate();
  const bare = new a.Fabricator(a.T.number, { seed: "x" }).fabricate();

  expect(one).toBe(two);
  expect(one).not.toBe(bare);
});

/**
 * Both seeded forms open an `"unattributed"` scope on their fork — a
 * caller-chosen root replaces a resolved file whether or not it composes.
 */
test("new Fabricator(schema, { seed: layer(...) }) reports no file from .trace", () => {
  const { T, Fabricator } = initialize({ seed: "layer-trace" });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }), {
    seed: layer("x"),
  });

  expect(built.trace.file).toBeUndefined();
});
