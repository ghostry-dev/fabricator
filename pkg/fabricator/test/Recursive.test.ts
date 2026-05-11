import { expect, test } from "bun:test";
import { FabricatorError, initialize, registry } from "@ghostry/fabricator";

/**
 * Instantiated explicitly: a bare `ReturnType<typeof initialize>` resolves
 * the type parameter to its *constraint* (`PlainObject`) rather than its
 * default, which would leave every `T.<kind>` as `unknown` — the same trap
 * `Record.test.ts` hit.
 */
type Registry = ReturnType<typeof initialize<typeof registry>>["T"];

/**
 * `T.recursive` closes the last major describability gap this library had —
 * trees, linked structures, a generic JSON value — none of which were
 * expressible before, since every compound kind normalized eagerly and
 * `Constructor.ts` walked the whole schema tree eagerly at build time. Manual
 * nesting worked exactly one level deep (verified during design: the
 * children had no children).
 *
 * These tests lean on the same tree shape throughout so the interesting
 * differences (depth, seed, isolation) stay the only variable.
 */

type Node = { value: number; children: Node[] };

function makeTree(T: Registry, depth = 3) {
  return T.recursive((self) =>
    T.object({
      value: T.number.integer.whereby({ min: 0, max: 9 }),
      children: T.array(self).whereby({ length: { max: 2 } }),
    }),
  ).whereby({ depth: { max: depth } });
}

function depthOf(node: Node): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(depthOf));
}

test("fabricates a tree, never exceeding the configured max depth", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-depth" });

  const built = new Fabricator(makeTree(T, 3));

  const depths = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const tree: Node = built.fabricate();
    const d = depthOf(tree);
    expect(d).toBeLessThanOrEqual(3);
    depths.add(d);
  }

  /** The depth is actually fuzzed, not pinned to one value. */
  expect(depths.size).toBeGreaterThan(1);
  /** And the bound is reachable, not just an unused ceiling. */
  expect(depths.has(3)).toBe(true);
});

test("depth.max = 0 degenerates to the terminal alone", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-zero-depth" });

  const built = new Fabricator(makeTree(T, 0));

  for (let i = 0; i < 20; i++) {
    const tree: Node = built.fabricate();
    expect(tree.children).toEqual([]);
  }
});

test("a JSON-value shape (choice body) fabricates and varies", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-json" });

  const Json = T.recursive((self) =>
    T.choice.uniform([
      T.string.whereby({ length: { max: 5 } }),
      T.number.integer.whereby({ min: 0, max: 99 }),
      T.array(self).whereby({ length: { max: 2 } }),
    ]),
  ).whereby({ depth: { max: 3 } });

  const built = new Fabricator(Json);

  const shapes = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const value = built.fabricate();
    shapes.add(Array.isArray(value) ? "array" : typeof value);
  }

  expect(shapes.size).toBeGreaterThan(1);
});

test("the terminal appears only once depth.max is reached, and never recurses further", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-terminal" });

  /**
   * A terminal deliberately shaped differently from `body` (a negative
   * value, outside `body`'s own `[0, 9]` range) so its presence at a given
   * node is unambiguous, and a max depth of exactly 1 so every leaf is
   * reachable in a small sample.
   */
  const Marked = T.recursive((self) =>
    T.object({
      value: T.number.integer.whereby({ min: 0, max: 9 }),
      children: T.array(self).whereby({ length: { min: 1, max: 1 } }),
    }),
  ).whereby({
    depth: { max: 1 },
    terminal: T.object({
      value: T.always(-1),
      children: T.opaque(() => [] as Node[]),
    }),
  });

  const built = new Fabricator(Marked);

  for (let i = 0; i < 30; i++) {
    const root: Node = built.fabricate();
    expect(root.value).toBeGreaterThanOrEqual(0);
    const child = root.children[0]!;
    expect(child.value).toBe(-1);
    /** The terminal's own `children` is never expanded further. */
    expect(child.children).toEqual([]);
  }
});

test("the same seed replays exactly, across any number of prior fabricate() calls", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "recursive-reproducible",
      clock: "seeded",
    });
    return new Fabricator(makeTree(T, 3));
  };

  const a = build();
  const b = build();

  for (let i = 0; i < 25; i++) {
    expect(a.fabricate()).toEqual(b.fabricate());
  }
});

/**
 * The invariant the whole `fork`/private-source design exists for: a
 * recursive schema's dispatch count is data-dependent (how deep any given
 * `fabricate()` call happens to go), so if it touched the shared, global
 * `(file, kind)` stream counters, that data-dependence would leak into
 * whichever *unrelated* Fabricator gets built next from the same instance.
 */
test("an unrelated Fabricator is unaffected by how many times a recursive schema fabricated before it", () => {
  function unrelatedAfter(recursiveCalls: number) {
    const { T, Fabricator } = initialize({
      seed: "recursive-isolation",
      clock: "seeded",
    });
    const tree = new Fabricator(makeTree(T, 3));
    for (let i = 0; i < recursiveCalls; i++) tree.fabricate();

    const unrelated = new Fabricator(
      T.number.integer.whereby({ min: 0, max: 999_999 }),
    );
    return unrelated.fabricate();
  }

  expect(unrelatedAfter(1)).toBe(unrelatedAfter(7));
});

test("two unrelated recursive schemas from the same instance don't perturb each other", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-two-trees" });

  const a = new Fabricator(makeTree(T, 3));
  const b = new Fabricator(makeTree(T, 3));

  /** Interleave draws from both; neither should ever throw or misbehave. */
  const results: Node[] = [];
  for (let i = 0; i < 10; i++) {
    results.push(a.fabricate());
    results.push(b.fabricate());
  }
  expect(results).toHaveLength(20);
  for (const tree of results) expect(depthOf(tree)).toBeLessThanOrEqual(3);
});

/**
 * Derived terminals empty a collection with a fresh `opaque(() => [])` per
 * call — never `always([])`. Each leaf must get its *own* array; a shared
 * reference would mean mutating one leaf's `children` silently mutates
 * every other leaf that happened to terminate in the same `fabricate()`.
 */
test("leaves that terminate do not share a collection reference", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-no-shared-refs" });

  const built = new Fabricator(makeTree(T, 3));

  const tree: Node = built.fabricate();

  function leaves(node: Node, acc: Node[] = []): Node[] {
    if (node.children.length === 0) acc.push(node);
    else for (const child of node.children) leaves(child, acc);
    return acc;
  }

  const allLeaves = leaves(tree);
  for (let i = 0; i < allLeaves.length; i++) {
    for (let j = i + 1; j < allLeaves.length; j++) {
      expect(allLeaves[i]!.children).not.toBe(allLeaves[j]!.children);
    }
  }
});

/**
 * `self` is never exposed as `T.self` — the only way to reach this error is
 * by holding onto a `self` reference captured from one `T.recursive`
 * callback and reusing it somewhere with no active recursion, e.g. storing
 * it in a variable and using it in an unrelated schema afterward.
 */
test("using a captured self reference outside any active recursion throws", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-misuse" });

  let escaped: unknown;
  T.recursive((self) => {
    escaped = self;
    return T.object({ value: T.number });
  }).whereby({ depth: { max: 1 } });

  const misused = T.object({ oops: escaped as never });

  const built = new Fabricator(misused);

  expect(() => built.fabricate()).toThrow(/active `T\.recursive`/);
});

/**
 * The `CategorySchema` example from `README.md`, verbatim. Kept as a test
 * because this README has previously documented API that did not typecheck
 * — the annotation below is the part that matters, since it pins the shape
 * the docs implicitly promise.
 */
test("README's T.recursive category tree example builds, typechecks, and fabricates", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-readme" });

  const CategorySchema = T.recursive((self) =>
    T.object({
      name: T.string.whereby({ length: { min: 3, max: 20 } }),
      children: T.array(self).whereby({ length: { max: 3 } }),
    }),
  ).whereby({ depth: { max: 3 } });

  const built = new Fabricator(CategorySchema);

  type Category = { name: string; children: Category[] };

  function depth(node: Category): number {
    if (node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(depth));
  }

  for (let i = 0; i < 30; i++) {
    const category: Category = built.fabricate();
    expect(category.name.length).toBeGreaterThanOrEqual(3);
    expect(category.name.length).toBeLessThanOrEqual(20);
    expect(depth(category)).toBeLessThanOrEqual(3);
  }
});

test("composes as an object field alongside ordinary fields", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-composes" });

  const built = new Fabricator(
    T.object({ id: T.always(1), tree: makeTree(T, 2) }),
  );

  const fabricated = built.fabricate();
  expect(fabricated.id).toBe(1);
  expect(depthOf(fabricated.tree)).toBeLessThanOrEqual(2);
});

test("a derived JSON terminal at depth.max = 0 is the non-self choice arms", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-json-derived" });

  const Json = T.recursive((self) =>
    T.choice.uniform([
      T.always("s"),
      T.always(1),
      T.array(self).whereby({ length: { max: 2 } }),
    ]),
  ).whereby({ depth: { max: 0 } });

  const built = new Fabricator(Json);
  const values = new Set<unknown>();
  for (let i = 0; i < 40; i++) {
    values.add(built.fabricate());
  }

  expect(values.has("s")).toBe(true);
  expect(values.has(1)).toBe(true);
  for (const value of values) {
    expect(Array.isArray(value)).toBe(false);
  }
});

test("a derived terminal empties an array even when body set length.min > 0", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-min-length" });

  const Chain = T.recursive((self) =>
    T.object({
      children: T.array(self).whereby({ length: { min: 1, max: 1 } }),
    }),
  ).whereby({ depth: { max: 1 } });

  const built = new Fabricator(Chain);
  for (let i = 0; i < 20; i++) {
    const root = built.fabricate();
    expect(root.children).toHaveLength(1);
    expect(root.children[0]!.children).toEqual([]);
  }
});

test("a derived terminal omits an omittable self field", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-omittable" });

  const List = T.recursive((self) =>
    T.object({ value: T.always(1), next: T.omittable(self) }),
  ).whereby({ depth: { max: 0 } });

  const built = new Fabricator(List);
  expect(built.fabricate()).toEqual({ value: 1 });
});

test("a derived terminal nulls a nullable self field", () => {
  const { T, Fabricator } = initialize({ seed: "recursive-nullable" });

  const List = T.recursive((self) =>
    T.object({ value: T.always(1), next: T.nullable(self) }),
  ).whereby({ depth: { max: 0 } });

  const built = new Fabricator(List);
  expect(built.fabricate()).toEqual({ value: 1, next: null });
});

test("a required self field cannot derive a terminal", () => {
  const { T } = initialize({ seed: "recursive-unterminable-field" });

  try {
    T.recursive((self) => T.object({ next: self })).whereby({
      depth: { max: 1 },
    });
    expect.unreachable();
  } catch (e) {
    expect(e).toBeInstanceOf(FabricatorError.UnterminableRecursiveError);
    expect((e as FabricatorError.UnterminableRecursiveError).path).toEqual([
      "next",
    ]);
  }
});

test("a tuple slot that is self cannot derive a terminal", () => {
  const { T } = initialize({ seed: "recursive-unterminable-tuple" });

  expect(() =>
    T.recursive((self) => T.tuple([self])).whereby({ depth: { max: 1 } }),
  ).toThrow(FabricatorError.UnterminableRecursiveError);
});

test("a choice whose every option contains self cannot derive a terminal", () => {
  const { T } = initialize({ seed: "recursive-unterminable-choice" });

  expect(() =>
    T.recursive((self) => T.choice.uniform([self])).whereby({
      depth: { max: 1 },
    }),
  ).toThrow(FabricatorError.UnterminableRecursiveError);
});

test("a naked self body cannot derive a terminal", () => {
  const { T } = initialize({ seed: "recursive-unterminable-root" });

  try {
    T.recursive((self) => self).whereby({ depth: { max: 1 } });
    expect.unreachable();
  } catch (e) {
    expect(e).toBeInstanceOf(FabricatorError.UnterminableRecursiveError);
    expect((e as FabricatorError.UnterminableRecursiveError).path).toEqual([]);
  }
});
