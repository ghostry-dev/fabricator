import {
  FabricatorError,
  initialize,
  layer,
  registry,
} from "@ghostry/fabricator";
import { expect, test } from "bun:test";

test("fork() with no overlay inherits the salt unchanged", () => {
  const instance = initialize({ salt: "fork-base" });
  const forked = instance.fork();

  expect(forked.salt).toEqual(instance.salt);
});

test("fork({ salt }) replaces the instance's salt outright", () => {
  const instance = initialize({ salt: "fork-base" });
  const forked = instance.fork({ salt: "a" });

  expect(forked.salt).toEqual(["a"]);
});

test("fork({ salt: layer(...) }) composes onto the instance's salt", () => {
  const instance = initialize({ salt: "fork-base" });
  const forked = instance.fork({ salt: layer("a") });

  expect(forked.salt).toEqual([...instance.salt, "a"]);
});

test("layer() accepts the full Salt surface — a single string or several", () => {
  const instance = initialize({ salt: "fork-base" });

  const single = instance.fork({ salt: layer("a") });
  const multi = instance.fork({ salt: layer(["a", "b"]) });

  expect(single.salt).toEqual([...instance.salt, "a"]);
  expect(multi.salt).toEqual([...instance.salt, "a", "b"]);
});

test("fork inherits algorithm/types/limits when unspecified", () => {
  const customAlgorithm = () => () => 0.5;
  const customTypes = registry.extend(({ T }) => ({ number: T.always(999) }));

  const instance = initialize({
    salt: "fork-inherit",
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
  const instance = initialize({ salt: "fork-override" });

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

test("fork({ limits: { combinatorial } }) throws InvalidCombinatorialLimitError at fork() time", () => {
  const instance = initialize({ salt: "fork-bad-limit" });

  expect(() => instance.fork({ limits: { combinatorial: 0 } })).toThrow(
    FabricatorError.InvalidCombinatorialLimitError,
  );
});

/**
 * The composition formula `layer(...)` follows, spelled out explicitly: a
 * fork's layered salt reproduces exactly what a bare `initialize({ salt:
 * [...instance.salt, "a"] })` gives.
 */
test("fork({ salt: layer('a') }) reproduces initialize({ salt: [...instance.salt, 'a'] })", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const instance = initialize({ salt: "fork-equivalence", clock });

  const viaFork = instance.fork({ salt: layer("a") });
  const viaInitialize = initialize({ salt: [...instance.salt, "a"], clock });

  const a = new viaFork.Fabricator(viaFork.T.number).fabricate();
  const b = new viaInitialize.Fabricator(viaInitialize.T.number).fabricate();

  expect(a).toBe(b);
});

test("chained fork({ salt: layer(...) }) calls compose left to right", () => {
  const instance = initialize({ salt: "fork-chain" });

  const chained = instance
    .fork({ salt: layer("a") })
    .fork({ salt: layer("b") });
  const flat = instance.fork({ salt: layer(["a", "b"]) });

  expect(chained.salt).toEqual(flat.salt);
});

test("a bare salt in a chained fork() call replaces, discarding every prior layer", () => {
  const instance = initialize({ salt: "fork-chain-replace" });

  const chained = instance.fork({ salt: layer("a") }).fork({ salt: "b" });
  const flat = instance.fork({ salt: "b" });

  expect(chained.salt).toEqual(flat.salt);
});

test("two forks of one instance are mutually isolated and neither perturbs the parent", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const instance = initialize({ salt: "fork-isolation", clock });

  const a = instance.fork({ salt: layer("a") });
  const b = instance.fork({ salt: layer("b") });

  new a.Fabricator(a.T.number).fabricate();
  const bValue = new b.Fabricator(b.T.number).fabricate();

  const freshB = initialize({ salt: instance.salt, clock }).fork({
    salt: layer("b"),
  });
  expect(new freshB.Fabricator(freshB.T.number).fabricate()).toBe(bValue);

  const parentOnce = new instance.Fabricator(instance.T.number).fabricate();
  const freshParent = initialize({ salt: instance.salt, clock });
  const parentAgain = new freshParent.Fabricator(
    freshParent.T.number,
  ).fabricate();
  expect(parentOnce).toBe(parentAgain);
});

test("fork() alone has no ambient effect on ordinary construction", () => {
  const instance = initialize({ salt: "fork-no-ambient", clock: "derived" });
  const other = initialize({ salt: "fork-no-ambient", clock: "derived" });

  instance.fork({ salt: layer("a") });

  const a = new instance.Fabricator(instance.T.number).fabricate();
  const b = new other.Fabricator(other.T.number).fabricate();

  expect(a).toBe(b);
});

/**
 * `root` is the lineage's identity handle: a root names itself, every
 * descendant names that same object, and two `initialize()` calls never share
 * one. That last property is what makes `a.root === b.root` the "same lineage?"
 * question — carrier identity cannot answer it, since two lineages may be
 * handed the same `stack`.
 */
test("root is the lineage head, names itself on a root, and is shared by every descendant", () => {
  const instance = initialize({ salt: "fork-root" });
  const child = instance.fork({ salt: layer("child") });
  const grandchild = child.fork({ salt: layer("grandchild") });

  expect(instance.root).toBe(instance);
  expect(child.root).toBe(instance);
  expect(grandchild.root).toBe(instance);

  expect(initialize({ salt: "fork-root-other" }).root).not.toBe(instance);
});

/**
 * A `wrap`'s scope is an ordinary derived instance, so its `root` is the
 * lineage head rather than the scope — the scope is not a root merely because a
 * frame was entered for it.
 */
test("a wrap scope's root is the lineage head, not the scope", () => {
  const instance = initialize({ salt: "fork-root-wrap" });

  expect(
    instance
      .fork({ salt: layer("child") })
      .wrap({ salt: layer("x") }, (scope) => scope.root),
  ).toBe(instance);
});

/**
 * `root` names the lineage's starting configuration, not whatever is in effect
 * — the distinction that keeps it from being mistaken for an ambient accessor.
 * Inside a wrap, `root.context.salt` does reflect the frame (the root is an
 * ancestor, so it resolves against it), while `root.salt` stays the root's
 * own.
 */
test("root is an identity, not the configuration in effect", () => {
  const instance = initialize({ salt: "fork-root-identity" });
  const child = instance.fork({ salt: layer("child") });

  child.wrap({ salt: layer("x") }, (scope) => {
    expect(scope.root.salt).toEqual(instance.salt);
    expect(scope.root.context.salt).toEqual([...child.salt, "x"]);
  });
});
