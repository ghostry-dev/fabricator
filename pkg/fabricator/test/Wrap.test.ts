import { FabricatorError, initialize, layer } from "@ghostry/fabricator";
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

test("a nested wrap({ salt: layer(...) }) composes onto the active frame, equal to one flat wrap with the combined layer", () => {
  const instance = initialize({ salt: "wrap-nest" });

  const nested = instance.wrap({ salt: layer("a") }, () =>
    instance.wrap({ salt: layer("b") }, () =>
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
 * `wrap` lays its overlay over the _active frame_, not over the instance it was
 * called on — so calling `sibling.wrap(...)` while `instance`'s own wrap is
 * active composes onto `instance`'s frame, completely ignoring `sibling`'s own
 * base salt.
 */
test("wrap() called on a forked instance while another wrap is active lays over the active frame, not the fork's own base", () => {
  const instance = initialize({ salt: "wrap-fork-nesting" });
  const sibling = instance.fork({ salt: layer("sibling") });

  const nested = instance.wrap({ salt: layer("a") }, () =>
    sibling.wrap({ salt: layer("b") }, () =>
      new instance.Fabricator(instance.T.number).fabricate(),
    ),
  );

  const flat = instance.wrap({ salt: layer(["a", "b"]) }, () =>
    new instance.Fabricator(instance.T.number).fabricate(),
  );

  expect(nested).toBe(flat);
});

/**
 * A frame reaches the whole lineage: a fork created _outside_ a wrap — with no
 * ancestry relationship to the wrap beyond sharing the same lineage's stack —
 * is still overridden _inside_ one, for both `Fabricator` and `combinatorial`.
 */
test("a sibling fork created outside a wrap is overridden inside it — both Fabricator and combinatorial", () => {
  const instance = initialize({ salt: "wrap-lineage-reach" });
  const sibling = instance.fork({ salt: layer("sibling") });

  let siblingBuildInWrap: number | undefined;
  let siblingCombinatorialInWrap: unknown[] | undefined;

  instance.wrap({ salt: layer("a") }, () => {
    siblingBuildInWrap = new sibling.Fabricator(sibling.T.number).fabricate();
    siblingCombinatorialInWrap = [
      ...sibling.combinatorial(sibling.T.enum.uniform(["1", "2", "3"])),
    ];
  });

  const expected = instance.fork({ salt: layer("a") });
  const expectedBuild = new expected.Fabricator(expected.T.number).fabricate();
  const expectedCombinatorial = [
    ...expected.combinatorial(expected.T.enum.uniform(["1", "2", "3"])),
  ];

  expect(siblingBuildInWrap).toBe(expectedBuild);
  expect(siblingCombinatorialInWrap).toEqual(expectedCombinatorial);
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

test("a context reference captured before a wrap reflects the wrap live, since it's a getter, not a snapshot", () => {
  const instance = initialize({ salt: "wrap-context-live" });
  const context = instance.context;

  expect(context.salt).toEqual(instance.salt);

  instance.wrap({ salt: layer("x") }, () => {
    expect(context.salt).toEqual([...instance.salt, "x"]);
  });

  expect(context.salt).toEqual(instance.salt);
});

test("context.algorithm and .attribution reflect the active frame's overrides", () => {
  const instance = initialize({ salt: "wrap-context-fields" });
  const customAlgorithm = () => () => 0.5;

  instance.wrap(
    { algorithm: customAlgorithm, attribution: { kind: "none" } },
    () => {
      expect(instance.context.algorithm).toBe(customAlgorithm);
      expect(instance.context.attribution).toEqual({ kind: "none" });
    },
  );

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
 * the wrap's configuration rather than reverting to the instance's own. All
 * three reads are therefore `undefined`: the wrap set `{ kind: "none" }`, which
 * suppresses file attribution, and none of them escape it.
 */
test("the ambient frame survives an await inside the wrap block", async () => {
  const instance = initialize({ salt: "wrap-async" });

  let duringSyncFile: string | undefined;
  let afterAwaitFile: string | undefined;
  let viaScopeFile: string | undefined;

  await instance.wrap({ attribution: { kind: "none" } }, async (scope) => {
    duringSyncFile = new instance.Fabricator(instance.T.number).trace.file;
    await Promise.resolve();
    afterAwaitFile = new instance.Fabricator(instance.T.number).trace.file;
    viaScopeFile = new scope.Fabricator(scope.T.number).trace.file;
  });

  expect(duringSyncFile).toBeUndefined();
  expect(afterAwaitFile).toBeUndefined();
  expect(viaScopeFile).toBeUndefined();
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

test(".trace inside a wrap reports a real file under the default attribution", () => {
  const instance = initialize({ salt: "wrap-trace-file" });

  let file: string | undefined;
  instance.wrap({ salt: layer("x") }, () => {
    file = new instance.Fabricator(
      instance.T.string.whereby({ length: { max: 8 } }),
    ).trace.file;
  });

  expect(file).toBe("Wrap.test.ts");
});

test(".trace inside a wrap overriding attribution to none reports no file", () => {
  const instance = initialize({ salt: "wrap-trace-none" });

  let file: string | undefined;
  instance.wrap({ attribution: { kind: "none" } }, () => {
    file = new instance.Fabricator(
      instance.T.string.whereby({ length: { max: 8 } }),
    ).trace.file;
  });

  expect(file).toBeUndefined();
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
