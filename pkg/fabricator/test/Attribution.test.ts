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
    salt: "cross-checkout",
    clock: "derived",
    attribution: { kind: "rooted", root: checkoutA.here },
  });
  const instanceB = initialize({
    salt: "cross-checkout",
    clock: "derived",
    attribution: { kind: "rooted", root: checkoutB.here },
  });

  const a = checkoutA.traceHere(instanceA.Fabricator);
  const b = checkoutB.traceHere(instanceB.Fabricator);

  expect(a?.file).toBe("leaf.ts");
  expect(a).toEqual(b);
});

test("rooted attribution still diverges when the relative path actually differs", () => {
  const instanceA = initialize({
    salt: "cross-checkout",
    clock: "derived",
    attribution: { kind: "rooted", root: checkoutA.here },
  });
  const instanceB = initialize({
    salt: "cross-checkout",
    clock: "derived",
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
  const child = parent.fork("child-salt");

  const root = child.toRoot("attributed");
  toStreamFromTrace(child.algorithm, { ...root, path: [], kind: "number" });

  expect(root.file).toBe("../Attribution.test.ts");
});

test("the default attribution policy is call site, relativized to this file", () => {
  const { T, Fabricator } = initialize({ salt: "default-attribution" });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }));

  expect(built.trace.file).toBe("Attribution.test.ts");
});

test("a rooted policy accepts a file:// URL root and decodes it", () => {
  const { T, Fabricator } = initialize({
    salt: "rooted-url",
    attribution: { kind: "rooted", root: new URL("..", import.meta.url).href },
  });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }));

  expect(built.trace.file).toBe("test/Attribution.test.ts");
});

test("a construction in another file relativizes under this file's default call-site root", () => {
  const { Fabricator } = initialize({ salt: "ascent-here" });

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

test("none attributes nothing, so two independent instances draw identical data from a shared salt", () => {
  const instanceA = initialize({
    salt: "none-mode",
    clock: "derived",
    attribution: { kind: "none" },
  });
  const hereA = fabricateSharedSchemaHere(instanceA.Fabricator);

  const instanceB = initialize({
    salt: "none-mode",
    clock: "derived",
    attribution: { kind: "none" },
  });
  const thereB = new instanceB.Fabricator(sharedSchema()).fabricate();

  expect(hereA).toEqual(thereB);
});

test("none produces a trace with no file", () => {
  const { T, Fabricator } = initialize({
    salt: "none-trace",
    attribution: { kind: "none" },
  });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }));

  expect(built.trace.file).toBeUndefined();
});

/**
 * Under `{ kind: "none" }`, every construction shares one file-less bucket — so
 * unlike a real file's counter, the _n_th construction anywhere in the instance
 * gets the _n_th index. A salt does not opt out of that bucket: it pins the
 * salt slot and leaves the counter alone, so two same-salt builds separated by
 * other work take different ordinals and diverge.
 *
 * Opting out of the shared bucket is `fork`'s job — an isolated source brings
 * its own counter, which is why the forked pair below matches while the inline
 * pair does not.
 */
test("none + a salted Fabricator still shares the one counter, but a fork doesn't", () => {
  const instance = initialize({
    salt: "none-interleave",
    attribution: { kind: "none" },
  });
  const { T, Fabricator } = instance;
  const schema = () => T.object({ x: T.number });

  new Fabricator(T.number).fabricate();

  const a = new Fabricator(schema(), { salt: "pinned" }).fabricate();
  new Fabricator(T.number).fabricate();
  const b = new Fabricator(schema(), { salt: "pinned" }).fabricate();

  expect(a).not.toEqual(b);

  const forkedA = new (instance.fork({ salt: "pinned" }).Fabricator)(
    schema(),
  ).fabricate();
  new Fabricator(T.number).fabricate();
  const forkedB = new (instance.fork({ salt: "pinned" }).Fabricator)(
    schema(),
  ).fabricate();

  expect(forkedA).toEqual(forkedB);
});

test("none still diverges between two ordinary, unsalted constructions", () => {
  const { T, Fabricator } = initialize({
    salt: "none-diverge",
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
    salt: "recursive-attribution",
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
  const { T, Fabricator } = initialize({ salt: "same-file-diverge" });

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
      salt: "invocation-independence",
      clock: "derived",
    });
    return [
      new Fabricator(T.number).fabricate(),
      new Fabricator(T.number).fabricate(),
    ];
  };

  const interleaved = () => {
    const { T, Fabricator } = initialize({
      salt: "invocation-independence",
      clock: "derived",
    });
    const first = new Fabricator(T.number).fabricate();
    fabricateSharedSchemaHere(Fabricator);
    const second = new Fabricator(T.number).fabricate();
    return [first, second];
  };

  expect(interleaved()).toEqual(alone());
});

/**
 * A bare `options.salt` replaces the instance's own salt outright, exactly as
 * `fork({ salt })` does, so two differently-salted instances agree — but only
 * once everything _else_ in the trace agrees too. Both builds are written in
 * this file, one after the other, and each forks fresh (drawing ordinal 0 from
 * its own empty counter), so file and ordinal match.
 *
 * The clock has to be pinned, and pinned to a literal `Date` specifically. A
 * shared `clock: "derived"` would _not_ work here: `deriveClock` derives from
 * each instance's own salt, and these two differ by construction, so the two
 * builds would inherit different instants and diverge for a reason that has
 * nothing to do with what this test is checking.
 */
test("new Fabricator(schema, { salt }) reproduces regardless of the instance's own salt, given the same clock", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const a = initialize({ salt: "instance-a", clock });
  const b = initialize({ salt: "instance-b", clock });

  const one = new a.Fabricator(a.T.number, { salt: "shared" }).fabricate();
  const two = new b.Fabricator(b.T.number, { salt: "shared" }).fabricate();

  expect(one).toBe(two);
});

/**
 * `salt: layer(...)` composes onto the instance's own salt rather than
 * replacing it — the pinned slot holds exactly `[...instance.salt, ...given]`,
 * not `given` alone.
 *
 * Asserted on the trace rather than on fabricated values: both forms pin only
 * the salt, so two builds written here would also differ by ordinal, and
 * comparing their output would conflate the two slots.
 */
test("new Fabricator(schema, { salt: layer(...) }) composes onto the instance's salt", () => {
  const { T, Fabricator, salt } = initialize({ salt: "composing-base" });

  const layered = new Fabricator(T.number, { salt: layer("x") });
  const replaced = new Fabricator(T.number, { salt: "x" });

  expect(layered.trace.salt).toEqual([...salt, "x"]);
  expect(replaced.trace.salt).toEqual(["x"]);
});

/**
 * The whole reason the layered form exists: unlike a bare `{ salt }`, which
 * ignores the instance entirely, a layered salt still varies when the instance
 * itself is re-salted.
 */
test("new Fabricator(schema, { salt: layer(...) }) still varies when the instance is re-salted", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const a = initialize({ salt: "instance-a", clock });
  const b = initialize({ salt: "instance-b", clock });

  const one = new a.Fabricator(a.T.number, { salt: layer("x") }).fabricate();
  const two = new b.Fabricator(b.T.number, { salt: layer("x") }).fabricate();

  expect(one).not.toBe(two);
});

/**
 * A layered salt still forks a fully isolated source, exactly like a bare one —
 * so it reproduces across files/instances given the same effective (instance
 * salt + layered salt) pair, and differs from the bare form given the same
 * layered value alone.
 */
test("new Fabricator(schema, { salt: layer(...) }) reproduces given the same instance and layer", () => {
  const a = initialize({ salt: "shared-instance-salt", clock: "derived" });
  const b = initialize({ salt: "shared-instance-salt", clock: "derived" });

  const one = new a.Fabricator(a.T.number, { salt: layer("x") }).fabricate();
  const two = new b.Fabricator(b.T.number, { salt: layer("x") }).fabricate();
  const bare = new a.Fabricator(a.T.number, { salt: "x" }).fabricate();

  expect(one).toBe(two);
  expect(one).not.toBe(bare);
});

/**
 * Neither salted form says anything about rooting: both fork and then attribute
 * to their own file, exactly as an unsalted build does. Naming a salt is a
 * statement about the salt alone.
 */
test("new Fabricator(schema, { salt: layer(...) }) reports its own file from .trace", () => {
  const { T, Fabricator } = initialize({ salt: "layer-trace" });
  const built = new Fabricator(T.string.whereby({ length: { max: 8 } }), {
    salt: layer("x"),
  });

  expect(built.trace.file).toBeDefined();
  expect(built.trace.root).toBe("attributed");
});
