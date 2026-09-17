import {
  FabricatorError,
  initialize,
  layer,
  registry,
} from "@ghostry/fabricator";
import { toSynchronousStack } from "@ghostry/fabricator/internal";
import { expect, test } from "bun:test";

/**
 * The load-bearing assertion: inside one `wrap`, construction reached
 * implicitly (through the outer `instance.Fabricator`) and explicitly (through
 * `scope.Fabricator`) must resolve against the _same_ `RandomSource` — sharing
 * one set of construction-ordinal counters — or an interleaved sequence would
 * diverge from the same calls made entirely through `scope`. This is exactly
 * what would break if the `wrap`'s `Frame` stashed the wrong source.
 */
test("implicit (ambient) and explicit (scope.Fabricator) construction inside a wrap share one source", () => {
  const instance = initialize({ salt: "wrap-shared-source" });

  const interleaved: number[] = [];
  instance.wrap({ salt: layer("x") }, (scope) => {
    interleaved.push(new instance.Fabricator(instance.T.number).fabricate());
    interleaved.push(new scope.Fabricator(scope.T.number).fabricate());
    interleaved.push(new instance.Fabricator(instance.T.number).fabricate());
  });

  const allViaScope: number[] = [];
  instance.wrap({ salt: layer("x") }, (scope) => {
    allViaScope.push(new scope.Fabricator(scope.T.number).fabricate());
    allViaScope.push(new scope.Fabricator(scope.T.number).fabricate());
    allViaScope.push(new scope.Fabricator(scope.T.number).fabricate());
  });

  expect(interleaved).toEqual(allViaScope);
});

test("two builds inside one wrap reproduce what the equivalent fork gives for the same call sites in the same order", () => {
  const instance = initialize({ salt: "wrap-fork-equivalence" });

  const viaWrap: number[] = [];
  instance.wrap({ salt: layer("x") }, () => {
    viaWrap.push(new instance.Fabricator(instance.T.number).fabricate());
    viaWrap.push(new instance.Fabricator(instance.T.number).fabricate());
  });

  const forked = instance.fork({ salt: layer("x") });
  const viaFork = [
    new forked.Fabricator(forked.T.number).fabricate(),
    new forked.Fabricator(forked.T.number).fabricate(),
  ];

  expect(viaWrap).toEqual(viaFork);
});

test("two sequential identical wraps reproduce each other", () => {
  const instance = initialize({ salt: "wrap-repeat" });

  const first = instance.wrap({ salt: layer("x") }, () =>
    new instance.Fabricator(instance.T.number).fabricate(),
  );
  const second = instance.wrap({ salt: layer("x") }, () =>
    new instance.Fabricator(instance.T.number).fabricate(),
  );

  expect(first).toBe(second);
});

test("wrap returns the block's own return value", () => {
  const instance = initialize({ salt: "wrap-return" });

  expect(instance.wrap({ salt: layer("x") }, () => 42)).toBe(42);
});

/**
 * `wrap` lays its overlay over the instance it was called on, so nesting
 * accumulates when the inner `wrap` is reached _through the enclosing scope_ —
 * the instance the outer block was handed. That is the composing form, and it
 * equals one flat `wrap` carrying both layers.
 */
test("a nested scope.wrap({ salt: layer(...) }) composes onto the enclosing scope, equal to one flat wrap with the combined layer", () => {
  const instance = initialize({ salt: "wrap-nest" });

  const nested = instance.wrap({ salt: layer("a") }, (scope) =>
    scope.wrap({ salt: layer("b") }, () =>
      new instance.Fabricator(instance.T.number).fabricate(),
    ),
  );

  const flat = instance.wrap({ salt: layer(["a", "b"]) }, () =>
    new instance.Fabricator(instance.T.number).fabricate(),
  );

  expect(nested).toBe(flat);
});

/**
 * The counterpart, and the reason the rule is worth stating: a `wrap` reached
 * through a receiver bound _outside_ the enclosing block — the common case,
 * since a destructured `wrap` is permanently bound to the instance it came from
 * — restates from that instance rather than accumulating. The enclosing
 * `layer("a")` is discarded, exactly as a bare `salt` discards it.
 */
test("a nested wrap on the base instance restates from that instance, ignoring the enclosing frame", () => {
  const instance = initialize({ salt: "wrap-nest-restate" });

  const nested = instance.wrap({ salt: layer("a") }, () =>
    instance.wrap({ salt: layer("b") }, () =>
      new instance.Fabricator(instance.T.number).fabricate(),
    ),
  );

  const flat = instance.wrap({ salt: layer("b") }, () =>
    new instance.Fabricator(instance.T.number).fabricate(),
  );

  expect(nested).toBe(flat);
});

/**
 * `context.scope()` is how to compose onto whatever is in effect without
 * holding the enclosing block's `scope` — the explicit spelling of what `wrap`
 * itself used to do implicitly. Reached through a base-bound receiver, exactly
 * as the restating test above, it nevertheless accumulates, because the
 * receiver it resolves to is the frame's own scope.
 */
test("a nested context.scope().wrap({ salt: layer(...) }) composes onto the frame in effect", () => {
  const instance = initialize({ salt: "wrap-nest-context-scope" });

  const nested = instance.wrap({ salt: layer("a") }, () =>
    instance.context
      .scope()
      .wrap({ salt: layer("b") }, () =>
        new instance.Fabricator(instance.T.number).fabricate(),
      ),
  );

  const flat = instance.wrap({ salt: layer(["a", "b"]) }, () =>
    new instance.Fabricator(instance.T.number).fabricate(),
  );

  expect(nested).toBe(flat);
});

test("a bare salt in a nested wrap replaces, ignoring the enclosing frame", () => {
  const instance = initialize({ salt: "wrap-nest-replace" });

  const nested = instance.wrap({ salt: layer("a") }, () =>
    instance.wrap({ salt: "b" }, () =>
      new instance.Fabricator(instance.T.number).fabricate(),
    ),
  );

  const flat = instance.wrap({ salt: "b" }, () =>
    new instance.Fabricator(instance.T.number).fabricate(),
  );

  expect(nested).toBe(flat);
});

/**
 * The receiver decides, whichever instance it is: `fork.wrap(...)` entered
 * while another `wrap` is already open still lays over the fork's own config,
 * keeping its `"fork"` salt and discarding the enclosing `"a"`. Built through
 * `scope` rather than `instance`, because `instance` is an ancestor of `forked`
 * and would pick up `forked`'s wrap rather than measuring that wrap's own
 * overlay in isolation.
 */
test("wrap() called on a forked instance while another wrap is open still lays over that fork's own base", () => {
  const instance = initialize({ salt: "wrap-fork-nesting" });
  const forked = instance.fork({ salt: layer("fork") });

  const nested = instance.wrap({ salt: layer("a") }, () =>
    forked.wrap({ salt: layer("b") }, (scope) =>
      new scope.Fabricator(scope.T.number).fabricate(),
    ),
  );

  const flat = forked.wrap({ salt: layer("b") }, (scope) =>
    new scope.Fabricator(scope.T.number).fabricate(),
  );

  expect(nested).toBe(flat);
  expect(
    instance.wrap({ salt: layer("a") }, () =>
      forked.wrap({ salt: layer("b") }, (scope) => scope.salt),
    ),
  ).toEqual([...forked.salt, "b"]);
});

/**
 * A wrap governs the instance it was called on and that instance's ancestors,
 * never a descendant. A fork created before the wrap — even of the receiver —
 * draws its own configuration inside one, for both `Fabricator` and
 * `combinatorial`.
 *
 * The enumerated schema pairs the enum with a fuzzed `n`: a bare enum axis
 * enumerates identically under every salt, so it could not tell the two
 * configurations apart (see the `combinatorial` test further down).
 */
test("a fork of the receiver draws its own configuration inside the wrap — both Fabricator and combinatorial", () => {
  const instance = initialize({
    salt: "wrap-descendant-own-config",
    clock: new Date("2020-01-01T00:00:00.000Z"),
  });
  const forked = instance.fork({ salt: layer("B") });
  const schema = () =>
    forked.T.object({
      e: forked.T.enum.uniform(["1", "2", "3"]),
      n: forked.T.number,
    });

  let forkedBuildSalt: ReadonlyArray<string> | undefined;
  let forkedCombinatorialInWrap: unknown[] | undefined;

  const scope = instance.wrap({ salt: layer("A") }, (scoped) => {
    forkedBuildSalt = new forked.Fabricator(forked.T.number).trace.salt;
    forkedCombinatorialInWrap = [...forked.combinatorial(schema())];
    return scoped;
  });

  const governed = scope.fork({ salt: layer("B") });

  expect(forkedBuildSalt).toEqual(forked.salt);
  expect(forkedCombinatorialInWrap).toEqual([
    ...forked.combinatorial(schema()),
  ]);
  expect(forkedCombinatorialInWrap).not.toEqual([
    ...governed.combinatorial(schema()),
  ]);
});

/**
 * Three generations, so a wrap entered on a child can reach its ancestors
 * (`root`, `mid`) while leaving a sibling (`childA` vs `childB`) untouched:
 * `root` → `mid` → `childA`/`childB`.
 */
function toGenerations(salt: string) {
  const root = initialize({ salt });
  const mid = root.fork({ salt: layer("mid") });

  return {
    root,
    mid,
    childA: mid.fork({ salt: layer("a") }),
    childB: mid.fork({ salt: layer("b") }),
  };
}

/**
 * The limit on ambient reach: a frame entered on one `fork` is invisible to
 * another `fork` of the same parent. Two sibling derivations are unrelated
 * statements, so neither should start drawing the other's data merely because
 * the other happens to be mid-`wrap`.
 *
 * Asserted on salt rather than on a fabricated value: `childA` resolving
 * against its own source twice takes two ordinals, so equal values would be the
 * wrong expectation even though the source is right.
 */
test("a frame entered on one fork is invisible to a sibling fork — Fabricator, combinatorial, and context alike", () => {
  const { childA, childB } = toGenerations("ancestry-siblings");
  const schema = () =>
    childA.T.object({
      e: childA.T.enum.uniform(["1", "2", "3"]),
      n: childA.T.number,
    });

  let builtSalt: ReadonlyArray<string> | undefined;
  let combinations: unknown[] | undefined;
  let contextSalt: ReadonlyArray<string> | undefined;
  let depth: number | undefined;

  const frame = childB.wrap({ salt: layer("frame") }, (scope) => {
    builtSalt = new childA.Fabricator(childA.T.number).trace.salt;
    combinations = [...childA.combinatorial(schema())];
    contextSalt = childA.context.salt;
    depth = childA.context.depth;
    return scope;
  });

  expect(builtSalt).toEqual(childA.salt);
  expect(combinations).toEqual([...childA.combinatorial(schema())]);
  expect(combinations).not.toEqual([...frame.combinatorial(schema())]);
  expect(contextSalt).toEqual(childA.salt);
  expect(depth).toBe(0);
});

/**
 * Ambience reaches up the line, not down. A frame entered on `childB` reaches
 * its ancestors — `mid` and `root` — because each is an ancestor of the
 * receiver. Anything derived from `childB` inside the block is a descendant and
 * draws its own configuration.
 */
test("a frame entered on a child reaches its ancestors, not its descendants", () => {
  const { root, mid, childB } = toGenerations("ancestry-ancestors-only");

  const expected = [...childB.salt, "frame"];

  let rootSalt: ReadonlyArray<string> | undefined;
  let midSalt: ReadonlyArray<string> | undefined;
  let descendantSalt: ReadonlyArray<string> | undefined;

  childB.wrap({ salt: layer("frame") }, () => {
    rootSalt = new root.Fabricator(root.T.number).trace.salt;
    midSalt = mid.context.salt;
    descendantSalt = childB.fork().context.salt;
  });

  expect(rootSalt).toEqual(expected);
  expect(midSalt).toEqual(expected);
  expect(descendantSalt).toEqual(childB.salt);
});

/**
 * A wrap on a parent does not govern its children. With `mid`'s wrap open and
 * `childA`'s nested inside it, `childB` draws its own configuration — `mid` is
 * an ancestor of `childB`, not a descendant of `childB`. `childA` sees only the
 * wrap entered on it; `mid`'s wrap does not reach it either.
 */
test("a wrap on a parent does not reach its children", () => {
  const { mid, childA, childB } = toGenerations(
    "ancestry-parent-does-not-reach",
  );

  let childASalt: ReadonlyArray<string> | undefined;
  let childBSalt: ReadonlyArray<string> | undefined;
  let childADepth: number | undefined;
  let childBDepth: number | undefined;

  mid.wrap({ salt: layer("outer") }, () => {
    childA.wrap({ salt: layer("inner") }, () => {
      childASalt = childA.context.salt;
      childBSalt = childB.context.salt;
      childADepth = childA.context.depth;
      childBDepth = childB.context.depth;
    });
  });

  expect(childASalt).toEqual([...childA.salt, "inner"]);
  expect(childBSalt).toEqual(childB.salt);
  expect(childADepth).toBe(1);
  expect(childBDepth).toBe(0);
});

function saltOf(instance: {
  readonly context: { readonly salt: ReadonlyArray<string> };
}) {
  return instance.context.salt;
}

/**
 * The rule in one fixture: a wrap governs the instance it was called on and
 * that instance's ancestors — never a descendant, a sibling, or another
 * `initialize()`. `B` is forked with `layer("B")` so it composes onto `A`; a
 * bare `{ salt: "B" }` would replace and give `["B"]`. Inside `B.wrap`, `A` is
 * governed by `B`'s wrap — the innermost wrap `A` is an ancestor of — while
 * `AA`, `A`'s own scope, is not.
 */
test("a wrap governs the receiver and its ancestors, never descendants, siblings, or another initialize()", () => {
  const A = initialize({ salt: "A" });
  const B = A.fork({ salt: layer("B") });
  const C = initialize({ salt: "C" });

  A.wrap({ salt: layer("AA") }, (AA) => {
    expect(saltOf(AA)).toEqual(["A", "AA"]);
    expect(saltOf(A)).toEqual(["A", "AA"]);
    expect(saltOf(B)).toEqual(["A", "B"]);
    expect(saltOf(C)).toEqual(["C"]);

    const AAA = AA.fork({ salt: layer("AAA") });
    expect(saltOf(AAA)).toEqual(["A", "AA", "AAA"]);

    AAA.wrap({ salt: layer("AAAA") }, (AAAA) => {
      expect(saltOf(AAAA)).toEqual(["A", "AA", "AAA", "AAAA"]);
      expect(saltOf(AAA)).toEqual(["A", "AA", "AAA", "AAAA"]);
      expect(saltOf(AA)).toEqual(["A", "AA", "AAA", "AAAA"]);
      expect(saltOf(A)).toEqual(["A", "AA", "AAA", "AAAA"]);
      expect(saltOf(B)).toEqual(["A", "B"]);
      expect(saltOf(C)).toEqual(["C"]);
    });

    B.wrap({ salt: layer("BB") }, (BB) => {
      expect(saltOf(BB)).toEqual(["A", "B", "BB"]);
      expect(saltOf(B)).toEqual(["A", "B", "BB"]);
      expect(saltOf(A)).toEqual(["A", "B", "BB"]);
      expect(saltOf(AA)).toEqual(["A", "AA"]);
      expect(saltOf(AAA)).toEqual(["A", "AA", "AAA"]);
      expect(saltOf(C)).toEqual(["C"]);
    });
  });
});

/**
 * A fork takes the configuration of the instance it was forked from. The
 * scope's configuration contains the wrap's layer; `A`'s own does not. To
 * derive something that carries a wrap's configuration, fork the scope — `AA`,
 * or `A.context.scope()` when it is not in hand.
 */
test("forking the scope carries the wrap's layer; forking the receiver does not", () => {
  const A = initialize({ salt: "A" });

  A.wrap({ salt: layer("AA") }, (AA) => {
    expect(saltOf(AA.fork({ salt: layer("B") }))).toEqual(["A", "AA", "B"]);
    expect(saltOf(A.fork({ salt: layer("B") }))).toEqual(["A", "B"]);
  });
});

/**
 * Nesting through `AA` composes onto `AA`; nesting through `A` restates from
 * `A`'s own configuration. Either way `AA` — the first wrap's scope, and so a
 * descendant of `A` — is not governed by a later wrap entered on `A`, and keeps
 * drawing its own configuration inside it.
 */
test("a scope is not governed by a later wrap on its receiver", () => {
  const A = initialize({ salt: "A" });

  A.wrap({ salt: layer("AA") }, (AA) => {
    AA.wrap({ salt: layer("AAA") }, (AAA) => {
      expect(saltOf(A)).toEqual(["A", "AA", "AAA"]);
      expect(saltOf(AA)).toEqual(["A", "AA", "AAA"]);
      expect(saltOf(AAA.fork({ salt: layer("B") }))).toEqual([
        "A",
        "AA",
        "AAA",
        "B",
      ]);
    });

    A.wrap({ salt: layer("C") }, (C) => {
      expect(saltOf(C)).toEqual(["A", "C"]);
      expect(saltOf(AA)).toEqual(["A", "AA"]);
    });
  });
});

/**
 * A fork of a wrap's scope keeps its own layer inside that wrap and under any
 * later wrap — it is a descendant of both receivers, so neither wrap reaches
 * it.
 */
test("a fork of a wrap's scope keeps its own layer under later wraps", () => {
  const A = initialize({ salt: "A" });

  A.wrap({ salt: layer("AA") }, (AA) => {
    const B = AA.fork({ salt: layer("B") });
    expect(saltOf(B)).toEqual(["A", "AA", "B"]);

    AA.wrap({ salt: layer("C") }, () => {
      expect(saltOf(B)).toEqual(["A", "AA", "B"]);
    });

    A.wrap({ salt: layer("C") }, () => {
      expect(saltOf(B)).toEqual(["A", "AA", "B"]);
    });
  });
});

/**
 * Why `visible` filters the whole chain rather than walking in from the
 * innermost frame and stopping at the first one this reader is not governed by:
 * `B`'s wrap is still open, and still governs `B`, while `C`'s — which does not
 * — is nested inside it. Stopping at `C`'s frame would leave `B` on its own
 * configuration, silently outside a wrap that applies to it.
 */
test("a reader skips a wrap that does not govern it and resolves against an enclosing one that does", () => {
  const A = initialize({ salt: "A" });
  const B = A.fork({ salt: layer("B") });
  const C = A.fork({ salt: layer("C") });

  B.wrap({ salt: layer("BB") }, () => {
    C.wrap({ salt: layer("CC") }, () => {
      expect(new B.Fabricator(B.T.number).trace.salt).toEqual(["A", "B", "BB"]);
      expect(saltOf(B)).toEqual(["A", "B", "BB"]);
      expect(B.context.depth).toBe(1);
    });
  });
});

/**
 * `depth` counts the wraps governing that instance. A scope is a descendant of
 * its receiver, so none govern it — it already holds the wrap's configuration
 * as its own.
 */
test("a wrap's scope has depth 0; the receiver has depth 1", () => {
  const A = initialize({ salt: "A" });

  A.wrap({ salt: layer("AA") }, (AA) => {
    expect(A.context.depth).toBe(1);
    expect(AA.context.depth).toBe(0);
    expect(AA.context.salt).toEqual(["A", "AA"]);
  });
});

/**
 * `ancestry[0]` is lineage identity, and it is the instance — not the carrier —
 * that now carries it. So two `initialize()` calls handed the _same_ carrier
 * still cannot see each other's frames: their roots mint unrelated tokens,
 * which leaves `initialize({ stack })` a choice of carrier and nothing more.
 */
test("two lineages sharing one carrier stay mutually invisible", () => {
  const stack = toSynchronousStack();
  const a = initialize({ salt: "ancestry-shared-carrier-a", stack });
  const b = initialize({ salt: "ancestry-shared-carrier-b", stack });

  expect(a.ancestry[0]).not.toBe(b.ancestry[0]);

  let bSaltDuringA: ReadonlyArray<string> | undefined;
  let bDepthDuringA: number | undefined;

  a.wrap({ salt: layer("x") }, () => {
    bSaltDuringA = b.context.salt;
    bDepthDuringA = b.context.depth;
  });

  expect(bSaltDuringA).toEqual(b.salt);
  expect(bDepthDuringA).toBe(0);
});

/**
 * A fork and its parent share a root but never an identity, and every
 * instance's own token is the last element of its chain — which is what makes a
 * prefix comparison answer "on one line?".
 */
test("ancestry records the lineage root and extends by one token per derivation", () => {
  const { root, mid, childA, childB } = toGenerations("ancestry-shape");

  expect(root.ancestry).toHaveLength(1);
  expect(mid.ancestry).toHaveLength(2);
  expect(childA.ancestry).toHaveLength(3);

  for (const derived of [mid, childA, childB]) {
    expect(derived.ancestry[0]).toBe(root.ancestry[0]);
  }

  expect(childA.ancestry.slice(0, 2)).toEqual([...mid.ancestry]);
  expect(childA.ancestry[2]).not.toBe(childB.ancestry[2]);
});

/**
 * `types` follows the receiver now, and so does the declared `$WrapRegistry`
 * default — previously the two disagreed, because the overlay took its `types`
 * from the active frame while the type parameter defaulted to the receiver's.
 * The `999` is the runtime half of that agreement: it can only come from the
 * fork's own registry.
 */
test("a wrap on a fork with its own registry keeps that registry, even inside another frame", () => {
  const instance = initialize({ salt: "wrap-registry" });
  const forked = instance.fork({
    types: registry.extend(({ T }) => ({ number: T.always(999) })),
  });

  const built = instance.wrap({ salt: layer("a") }, () =>
    forked.wrap({}, (scope) =>
      new scope.Fabricator(scope.T.number).fabricate(),
    ),
  );

  expect(built).toBe(999);
});

/**
 * `context.scope()` resolves live on every call, never snapshotting: it names
 * the frame's own scope while one is visible and reverts to this instance
 * after. Identity, not equality — it must be the very instance the block was
 * handed, or the two routes would carry separate construction counters.
 */
test("context.scope() is the visible frame's own scope, and reverts after the block", () => {
  const instance = initialize({ salt: "wrap-context-scope" });

  let handed: unknown;
  let seen: unknown;

  instance.wrap({ salt: layer("x") }, (scope) => {
    handed = scope;
    seen = instance.context.scope();
  });

  expect(seen).toBe(handed);
  expect(instance.context.scope()).toBe(instance);
  expect(instance.context.depth).toBe(0);
});

/**
 * A bare enumerable axis enumerates its members deterministically — index
 * order, not salt-dependent (only `coverage`'s `"cycle"` strategy permutes by
 * salt; see `Plan.ts`). So the schema here pairs the enumerable field with an
 * ordinary fuzzed one (`n`), whose _value_ within each enumerated combination
 * does vary by salt, which is what actually exercises the ambient-frame
 * override for `combinatorial`.
 */
test("combinatorial inside a wrap differs from outside it and matches the wrapped instance's own", () => {
  const instance = initialize({
    salt: "wrap-combinatorial",
    clock: new Date("2020-01-01T00:00:00.000Z"),
  });
  const schema = () =>
    instance.T.object({
      e: instance.T.enum.uniform(["1", "2", "3"]),
      n: instance.T.number,
    });

  const outside = [...instance.combinatorial(schema())];

  let inside: unknown[] = [];
  const scope = instance.wrap({ salt: layer("x") }, (scoped) => {
    inside = [...instance.combinatorial(schema())];
    return scoped;
  });

  const expected = [...scope.combinatorial(schema())];

  expect(inside).not.toEqual(outside);
  expect(inside).toEqual(expected);
});

/**
 * Coverage's `"cycle"` strategy _does_ permute by salt, but a 3-member enum is
 * only 6 schedules — two salts can land on the same one. Pair the enumerable
 * axis with a fuzzed `n`, same as the combinatorial sibling.
 */
test("coverage inside a wrap differs from outside it and matches the wrapped instance's own", () => {
  const instance = initialize({
    salt: "wrap-coverage",
    clock: new Date("2020-01-01T00:00:00.000Z"),
  });
  const schema = () =>
    instance.T.object({
      e: instance.T.enum.uniform(["1", "2", "3"]),
      n: instance.T.number,
    });

  const outside = [...instance.coverage(schema())];

  let inside: unknown[] = [];
  const scope = instance.wrap({ salt: layer("x") }, (scoped) => {
    inside = [...instance.coverage(schema())];
    return scoped;
  });

  const expected = [...scope.coverage(schema())];

  expect(inside).not.toEqual(outside);
  expect(inside).toEqual(expected);
});

test("context reflects the instance's own config outside any wrap, the active frame's inside one, and reverts after", () => {
  const instance = initialize({ salt: "wrap-context" });

  const outsideBefore = instance.context.salt;
  let insideSeed: readonly string[] | undefined;

  instance.wrap({ salt: layer("x") }, () => {
    insideSeed = instance.context.salt;
  });

  const outsideAfter = instance.context.salt;

  expect(outsideBefore).toEqual(instance.salt);
  expect(insideSeed).toEqual([...instance.salt, "x"]);
  expect(outsideAfter).toEqual(instance.salt);
});

/**
 * The companion to the test below, and the reason it is worth stating which of
 * the two you captured. `context`'s four _value_ properties are getters, so
 * destructuring one freezes it at the moment of destructuring — a stale value,
 * visibly wrong wherever it matters.
 *
 * `scope` is deliberately not among them. It is the one member acted through
 * rather than read, so freezing it would not surface as an obviously stale
 * value: an ambient build through the captured instance would still be correct
 * while `wrap`/`fork` on it laid over the wrong base — correct-looking code,
 * silently wrong. As a function it captures the _lookup_, so a destructured
 * `scope` stays live and that whole failure mode is unreachable.
 */
test("destructuring context's value properties snapshots them, while a destructured scope() stays live", () => {
  const instance = initialize({ salt: "wrap-context-destructured" });

  const { context } = instance;
  const { salt: frozenSalt, depth: frozenDepth } = instance.context;
  const spread = { ...instance.context };

  /** The capture that used to be the footgun, taken outside any frame. */
  const { scope } = instance.context;

  instance.wrap({ salt: layer("x") }, (entered) => {
    const wrapped = [...instance.salt, "x"];

    expect(context.salt).toEqual(wrapped);
    expect(context.depth).toBe(1);
    expect(context.scope()).toBe(entered);

    expect(frozenSalt).toEqual(instance.salt);
    expect(frozenDepth).toBe(0);
    expect(spread.salt).toEqual(instance.salt);

    /** Captured before the wrap, still resolving against it. */
    expect(scope()).toBe(entered);
    expect(scope().wrap({ salt: layer("b") }, (s) => s.salt)).toEqual([
      ...wrapped,
      "b",
    ]);
    expect(scope().fork().salt).toEqual(wrapped);
  });

  expect(scope()).toBe(instance);
});

/**
 * Holding the `Instance` `scope()` returned is a different act from holding
 * `scope` — an `Instance` is a fixed configuration like any other, so it stays
 * what it was. Pinned so the distinction is deliberate rather than incidental.
 */
test("the Instance returned by scope() is fixed, even though scope itself is live", () => {
  const instance = initialize({ salt: "wrap-context-scope-result" });

  instance.wrap({ salt: layer("x") }, () => {
    const held = instance.context.scope();

    instance.context.scope().wrap({ salt: layer("y") }, () => {
      expect(instance.context.scope().salt).toEqual([
        ...instance.salt,
        "x",
        "y",
      ]);
      expect(held.salt).toEqual([...instance.salt, "x"]);
    });
  });
});

test("a context reference captured before a wrap reflects the wrap live, since it's a getter, not a snapshot", () => {
  const instance = initialize({ salt: "wrap-context-live" });
  const context = instance.context;

  expect(context.salt).toEqual(instance.salt);

  instance.wrap({ salt: layer("x") }, () => {
    expect(context.salt).toEqual([...instance.salt, "x"]);
  });

  expect(context.salt).toEqual(instance.salt);
});

test("context.algorithm reflects the active frame's override", () => {
  const instance = initialize({ salt: "wrap-context-fields" });
  const customAlgorithm = () => () => 0.5;

  instance.wrap({ algorithm: customAlgorithm }, () => {
    expect(instance.context.algorithm).toBe(customAlgorithm);
  });

  expect(instance.context.algorithm).not.toBe(customAlgorithm);
});

test("the frame unwinds correctly when the wrap block throws", () => {
  const instance = initialize({ salt: "wrap-throw" });

  expect(() => {
    instance.wrap({ salt: layer("x") }, () => {
      throw new Error("boom");
    });
  }).toThrow("boom");

  expect(instance.context.salt).toEqual(instance.salt);
});

/**
 * The ambient frame survives `await`. On every runtime with `node:async_hooks`
 * — Node, Bun, Deno — `#stack` resolves to the `AsyncLocalStorage` carrier
 * (`Instance/Stack/Async.ts`), so a build reached after an `await` still sees
 * the wrap's configuration rather than reverting to the instance's own.
 */
test("the ambient frame survives an await inside the wrap block", async () => {
  const instance = initialize({ salt: "wrap-async" });

  let duringSyncSalt: ReadonlyArray<string> | undefined;
  let afterAwaitSalt: ReadonlyArray<string> | undefined;
  let viaScopeSalt: ReadonlyArray<string> | undefined;

  await instance.wrap({ salt: layer("frame") }, async (scope) => {
    duringSyncSalt = new instance.Fabricator(instance.T.number).trace.salt;
    await Promise.resolve();
    afterAwaitSalt = new instance.Fabricator(instance.T.number).trace.salt;
    viaScopeSalt = new scope.Fabricator(scope.T.number).trace.salt;
  });

  const expected = [...instance.salt, "frame"];
  expect(duringSyncSalt).toEqual(expected);
  expect(afterAwaitSalt).toEqual(expected);
  expect(viaScopeSalt).toEqual(expected);
});

/**
 * The async twin of this file's first test, and the invariant most at risk from
 * a carrier swap: ambient and explicit construction must resolve against one
 * `RandomSource` — hence one set of construction-ordinal counters — _across_ an
 * `await`, not merely before the first one. A carrier that re-derived a source
 * on resumption, or dropped the frame and let the base instance answer, would
 * leave `interleaved` diverging from `allViaScope` here while the synchronous
 * test above still passed.
 */
test("ambient and scope.Fabricator share one source across an await", async () => {
  const instance = initialize({ salt: "wrap-shared-source-async" });

  const interleaved: number[] = [];
  await instance.wrap({ salt: layer("x") }, async (scope) => {
    interleaved.push(new instance.Fabricator(instance.T.number).fabricate());
    await Promise.resolve();
    interleaved.push(new scope.Fabricator(scope.T.number).fabricate());
    await Promise.resolve();
    interleaved.push(new instance.Fabricator(instance.T.number).fabricate());
  });

  const allViaScope: number[] = [];
  await instance.wrap({ salt: layer("x") }, async (scope) => {
    allViaScope.push(new scope.Fabricator(scope.T.number).fabricate());
    allViaScope.push(new scope.Fabricator(scope.T.number).fabricate());
    allViaScope.push(new scope.Fabricator(scope.T.number).fabricate());
  });

  expect(interleaved).toEqual(allViaScope);
});

/**
 * Two overlapping `wrap`s on one lineage each keep their own frame. A LIFO
 * array could never satisfy this even if it awaited: interleaved pushes and
 * pops mean `current()` returns whichever frame was stacked last globally, so
 * both blocks would read the other's salt (or none at all). Staggered
 * deliberately, so the two blocks are genuinely in flight together.
 */
test("concurrent wraps on one lineage stay isolated", async () => {
  const instance = initialize({ salt: "wrap-concurrent" });

  const saltDuring = async (
    tag: string,
    delay: number,
  ): Promise<ReadonlyArray<string>> =>
    instance.wrap({ salt: layer(tag) }, async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return instance.context.salt;
    });

  const [a, b] = await Promise.all([saltDuring("a", 10), saltDuring("b", 1)]);

  expect(a).toEqual([...instance.salt, "a"]);
  expect(b).toEqual([...instance.salt, "b"]);
  expect(instance.context.salt).toEqual(instance.salt);
});

/**
 * The synchronous carrier cannot carry a frame across `await`, so `wrap`
 * refuses an async block outright rather than letting a later build resolve
 * against the base instance unannounced. Reachable in the wild only where
 * `#stack` resolved to `default` (no `node:async_hooks`); reached here by
 * supplying the carrier explicitly, which is what that config option is for.
 *
 * It throws synchronously — hence `expect(() => …)` and no `await` — so the
 * error lands at the `wrap` call site rather than inside a promise a caller
 * might never await.
 */
test("wrap rejects an async block under a synchronous stack", () => {
  const instance = initialize({
    salt: "wrap-sync-stack",
    stack: toSynchronousStack(),
  });

  expect(() => instance.wrap({ salt: layer("x") }, async () => {})).toThrow(
    FabricatorError.SynchronousStackError,
  );
});

/**
 * The same carrier, with a synchronous block, is entirely unaffected — the
 * guard keys on the block's return, not on the carrier alone.
 */
test("a synchronous stack still carries a synchronous wrap", () => {
  const instance = initialize({
    salt: "wrap-sync-stack-ok",
    stack: toSynchronousStack(),
  });

  let saltDuring: ReadonlyArray<string> | undefined;
  instance.wrap({ salt: layer("x") }, () => {
    saltDuring = instance.context.salt;
  });

  expect(saltDuring).toEqual([...instance.salt, "x"]);
  expect(instance.context.salt).toEqual(instance.salt);
});

test("a wrap on one lineage has no effect on an unrelated initialize() instance", () => {
  const a = initialize({ salt: "wrap-isolation-a" });
  const b = initialize({ salt: "wrap-isolation-b" });

  let bSeedDuringA: readonly string[] | undefined;

  a.wrap({ salt: layer("x") }, () => {
    bSeedDuringA = b.context.salt;
  });

  expect(bSeedDuringA).toEqual(b.salt);
});

/**
 * Pins an explicit `clock` on the instance: `wrap({ salt: layer("x") })`
 * composes onto the instance's own salt. A wall-clock default is inherited as a
 * number, so this pin is for `"derived"` instances (and for making the shared
 * "now" obvious); an inherited `"derived"` clock would re-derive whenever the
 * salt it composes changes (see `Instance/Types.ts`'s `Config.clock`) — so
 * without an explicit clock here, a `"derived"` wrap's own scoped source would
 * carry a different "now" than the instance's own.
 */
test("a bare per-call salt inside a wrap reproduces what the same call gives outside one", () => {
  const instance = initialize({
    salt: "wrap-bare-salt",
    clock: new Date("2020-01-01T00:00:00.000Z"),
  });

  const outside = new instance.Fabricator(instance.T.number, {
    salt: "pinned",
  }).fabricate();

  let inside: number | undefined;
  instance.wrap({ salt: layer("x") }, () => {
    inside = new instance.Fabricator(instance.T.number, {
      salt: "pinned",
    }).fabricate();
  });

  expect(inside).toBe(outside);
});

/**
 * The one place `layer` and `wrap` genuinely interact: a per-call layered salt
 * composes onto the _frame's_ effective salt, not the instance's own —
 * differing from the same call made outside the wrap.
 */
/**
 * Same reason as the test above: an explicit clock keeps the wrap's own
 * `layer("frame")` salt composition from also silently re-deriving a different
 * default clock, which would otherwise perturb this assertion for a reason
 * unrelated to what it's testing (salt composition, not "now").
 */
test("a per-call layer(...) salt inside a wrap composes onto the frame's salt, not the instance's", () => {
  const instance = initialize({
    salt: "wrap-layer-salt",
    clock: new Date("2020-01-01T00:00:00.000Z"),
  });

  let inside: number | undefined;
  instance.wrap({ salt: layer("frame") }, () => {
    inside = new instance.Fabricator(instance.T.number, {
      salt: layer("x"),
    }).fabricate();
  });

  const expected = new instance.Fabricator(instance.T.number, {
    salt: [...instance.salt, "frame", "x"],
  }).fabricate();

  expect(inside).toBe(expected);
});

test("structural keying survives a wrap — inserting a sibling field doesn't shift another field's value", () => {
  const instance = initialize({ salt: "wrap-structural-keying" });

  const before = instance.wrap({ salt: layer("x") }, (scope) =>
    new scope.Fabricator(
      scope.T.object({
        name: scope.T.string.whereby({ length: { max: 8 } }),
        age: scope.T.number,
      }),
    ).fabricate(),
  );

  const after = instance.wrap({ salt: layer("x") }, (scope) =>
    new scope.Fabricator(
      scope.T.object({
        id: scope.T.string.whereby({ length: { max: 8 } }),
        name: scope.T.string.whereby({ length: { max: 8 } }),
        age: scope.T.number,
      }),
    ).fabricate(),
  );

  expect(after.name).toBe(before.name);
  expect(after.age).toBe(before.age);
});

/**
 * The harness-free form of the setup pinned in `Harnessing.test.ts`: a caller
 * forks an application-wide configuration and treats the fork as _their_ root,
 * destructuring off it and never naming the lineage head again. Ambience has to
 * reach that fork through its own destructured `Fabricator`.
 *
 * Pinned separately from the harnessing test because nothing about it is
 * harness-specific — it is the general property that "which instance is a
 * lineage root" must not decide whose calls a frame reaches, since being a root
 * is an accident of where `initialize()` happened rather than a statement about
 * how an instance is used.
 */
test("a fork treated as its own root is reached by a wrap entered on it, through its destructured Fabricator", () => {
  const lineage = initialize({ salt: "wrap-fork-as-root" });
  const own = lineage.fork({ salt: layer("own") });

  const { Fabricator, T, wrap } = own;

  let builtSalt: ReadonlyArray<string> | undefined;
  let ownSalt: ReadonlyArray<string> | undefined;
  let lineageSalt: ReadonlyArray<string> | undefined;

  wrap({ salt: layer("x") }, () => {
    builtSalt = new Fabricator(T.number).trace.salt;
    ownSalt = own.context.salt;
    lineageSalt = lineage.context.salt;
  });

  const expected = [...own.salt, "x"];

  expect(builtSalt).toEqual(expected);
  expect(ownSalt).toEqual(expected);
  expect(lineageSalt).toEqual(expected);
});
