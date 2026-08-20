import {
  FabricatorError,
  initialize,
  layer,
  registry,
} from "@ghostry/fabricator";
import { expect, test } from "bun:test";
import { initializeHere } from "./fixtures/sharedSchema";

test("fork() with no overlay inherits the seed unchanged", () => {
  const instance = initialize({ seed: "fork-base" });
  const forked = instance.fork();

  expect(forked.seed).toEqual(instance.seed);
});

test("fork({ seed }) replaces the instance's seed outright", () => {
  const instance = initialize({ seed: "fork-base" });
  const forked = instance.fork({ seed: "a" });

  expect(forked.seed).toEqual(["a"]);
});

test("fork({ seed: layer(...) }) composes onto the instance's seed", () => {
  const instance = initialize({ seed: "fork-base" });
  const forked = instance.fork({ seed: layer("a") });

  expect(forked.seed).toEqual([...instance.seed, "a"]);
});

test("layer() accepts the full Seed surface — a single string or several", () => {
  const instance = initialize({ seed: "fork-base" });

  const single = instance.fork({ seed: layer("a") });
  const multi = instance.fork({ seed: layer(["a", "b"]) });

  expect(single.seed).toEqual([...instance.seed, "a"]);
  expect(multi.seed).toEqual([...instance.seed, "a", "b"]);
});

test("fork inherits algorithm/attribution/types/limits when unspecified", () => {
  const customAlgorithm = () => () => 0.5;
  const customTypes = registry.extend(({ T }) => ({ number: T.always(999) }));

  const instance = initialize({
    seed: "fork-inherit",
    algorithm: customAlgorithm,
    types: customTypes,
    limits: { combinatorial: 4 },
  });
  const forked = instance.fork();

  expect(new forked.Fabricator(forked.T.number).fabricate()).toBe(999);
  expect(() => [
    ...forked.combinatorial(
      forked.T.object({
        a: forked.T.enum.uniform(["1", "2", "3"]),
        b: forked.T.enum.uniform(["1", "2", "3"]),
        c: forked.T.enum.uniform(["1", "2", "3"]),
      }),
    ),
  ]).toThrow(FabricatorError.CombinatorialLimitExceededError);
});

test("fork overrides algorithm/types/limits when given", () => {
  const instance = initialize({ seed: "fork-override" });

  const customTypes = registry.extend(({ T }) => ({ number: T.always(7) }));
  const forked = instance.fork({
    types: customTypes,
    limits: { combinatorial: 2 },
  });

  expect(new forked.Fabricator(forked.T.number).fabricate()).toBe(7);
  expect(() => [
    ...forked.combinatorial(
      forked.T.object({ a: forked.T.enum.uniform(["1", "2", "3"]) }),
    ),
  ]).toThrow(FabricatorError.CombinatorialLimitExceededError);
});

/**
 * `fork()`'s own attribution inheritance must not re-resolve `"call site"` from
 * wherever `fork()` itself happens to be called — `overlay()` reuses the base's
 * already-resolved attribution unless the overlay explicitly supplies one.
 * `initializeHere()` resolves its root at `test/fixtures/`; forking from _this_
 * file must keep that root, not silently re-root at this file's own directory
 * (which would report `"Fork.test.ts"` with no ascent instead).
 */
test("fork() inherits the resolved attribution root rather than re-resolving from its own call site", () => {
  const instance = initializeHere();
  const forked = instance.fork();

  const built = new forked.Fabricator(
    forked.T.string.whereby({ length: { max: 8 } }),
  );

  expect(built.trace.file).toBe("../Fork.test.ts");
});

test("fork({ attribution: { kind: 'call site' } }) re-roots at fork()'s own call site", () => {
  const instance = initializeHere();
  const forked = instance.fork({ attribution: { kind: "call site" } });

  const built = new forked.Fabricator(
    forked.T.string.whereby({ length: { max: 8 } }),
  );

  expect(built.trace.file).toBe("Fork.test.ts");
});

test("fork({ attribution: { kind: 'rooted', root } }) throws InvalidAttributionRootError for a relative root", () => {
  const instance = initialize({ seed: "fork-bad-root" });

  expect(() =>
    instance.fork({ attribution: { kind: "rooted", root: "relative/path" } }),
  ).toThrow(FabricatorError.InvalidAttributionRootError);
});

test("fork({ limits: { combinatorial } }) throws InvalidCombinatorialLimitError at fork() time", () => {
  const instance = initialize({ seed: "fork-bad-limit" });

  expect(() => instance.fork({ limits: { combinatorial: 0 } })).toThrow(
    FabricatorError.InvalidCombinatorialLimitError,
  );
});

/**
 * The composition formula `layer(...)` follows, spelled out explicitly: a
 * fork's layered seed for a construction at a given call site reproduces
 * exactly what a bare `initialize({ seed: [...instance.seed, "a"] })` gives for
 * an equivalent call site under the same root.
 */
test("fork({ seed: layer('a') }) reproduces initialize({ seed: [...instance.seed, 'a'] })", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const instance = initialize({ seed: "fork-equivalence", clock });

  const viaFork = instance.fork({ seed: layer("a") });
  const viaInitialize = initialize({ seed: [...instance.seed, "a"], clock });

  const a = new viaFork.Fabricator(viaFork.T.number).fabricate();
  const b = new viaInitialize.Fabricator(viaInitialize.T.number).fabricate();

  expect(a).toBe(b);
});

test("chained fork({ seed: layer(...) }) calls compose left to right", () => {
  const instance = initialize({ seed: "fork-chain" });

  const chained = instance
    .fork({ seed: layer("a") })
    .fork({ seed: layer("b") });
  const flat = instance.fork({ seed: layer(["a", "b"]) });

  expect(chained.seed).toEqual(flat.seed);
});

test("a bare seed in a chained fork() call replaces, discarding every prior layer", () => {
  const instance = initialize({ seed: "fork-chain-replace" });

  const chained = instance.fork({ seed: layer("a") }).fork({ seed: "b" });
  const flat = instance.fork({ seed: "b" });

  expect(chained.seed).toEqual(flat.seed);
});

test("two forks of one instance are mutually isolated and neither perturbs the parent", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const instance = initialize({ seed: "fork-isolation", clock });

  const a = instance.fork({ seed: layer("a") });
  const b = instance.fork({ seed: layer("b") });

  new a.Fabricator(a.T.number).fabricate();
  const bValue = new b.Fabricator(b.T.number).fabricate();

  const freshB = initialize({ seed: instance.seed, clock }).fork({
    seed: layer("b"),
  });
  expect(new freshB.Fabricator(freshB.T.number).fabricate()).toBe(bValue);

  const parentOnce = new instance.Fabricator(instance.T.number).fabricate();
  const freshParent = initialize({ seed: instance.seed, clock });
  const parentAgain = new freshParent.Fabricator(
    freshParent.T.number,
  ).fabricate();
  expect(parentOnce).toBe(parentAgain);
});

test("fork() alone has no ambient effect on ordinary construction", () => {
  const instance = initialize({ seed: "fork-no-ambient", clock: "seeded" });
  const other = initialize({ seed: "fork-no-ambient", clock: "seeded" });

  instance.fork({ seed: layer("a") });

  const a = new instance.Fabricator(instance.T.number).fabricate();
  const b = new other.Fabricator(other.T.number).fabricate();

  expect(a).toBe(b);
});
