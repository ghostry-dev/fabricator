import { initialize, registry } from "@ghostry/fabricator";
import {
  defaultAlgorithm,
  encode,
  Kind,
  Meta,
  randomSalt,
  toRandomSource,
  toStream,
  toStreamFromTrace,
  type Algorithm,
} from "@ghostry/fabricator/internal";
import { expect, test } from "bun:test";
import {
  fabricateSharedSchemaHere,
  sharedSchema,
} from "./fixtures/sharedSchema";

const { T } = initialize();

const schema = () =>
  T.object({
    n: T.number,
    s: T.string.whereby({ length: { max: 16 } }),
    list: T.array(T.number).whereby({ length: { max: 5 } }),
  });

test("the same salt reproduces the same data", () => {
  const instanceA = initialize({ salt: "abc123", clock: "derived" });
  const instanceB = initialize({ salt: "abc123", clock: "derived" });
  const a = new instanceA.Fabricator(schema()).fabricate();
  const b = new instanceB.Fabricator(schema()).fabricate();

  expect(a).toEqual(b);
});

test("different salts diverge", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const instanceA = initialize({ salt: "1", clock });
  const instanceB = initialize({ salt: "2", clock });
  const a = new instanceA.Fabricator(schema()).fabricate();
  const b = new instanceB.Fabricator(schema()).fabricate();

  expect(a).not.toEqual(b);
});

test("a salted fabricator is reproducible across repeated draws", () => {
  const construct = () => {
    const instance = initialize({ salt: "42", clock: "derived" });
    return new instance.Fabricator(schema());
  };

  const one = construct();
  const two = construct();

  const drawsOne = [one.fabricate(), one.fabricate(), one.fabricate()];
  const drawsTwo = [two.fabricate(), two.fabricate(), two.fabricate()];

  expect(drawsOne).toEqual(drawsTwo);
});

test("instances stay isolated regardless of what interleaves their draws", () => {
  /**
   * Rerun the exact same scenario — build two fabricators from one instance,
   * interleave a draw from an unrelated instance between their draws — from
   * scratch in a fresh instance each time. If anything here leaked across
   * instances or across builds, the two runs would diverge.
   */
  const run = () => {
    const { Fabricator } = initialize({ salt: "7", clock: "derived" });
    const a = new Fabricator(schema());
    const b = new Fabricator(schema());

    const first = a.fabricate();
    b.fabricate();
    const throwaway = initialize({ salt: "12345", clock: "derived" });
    new throwaway.Fabricator(schema()).fabricate();
    const second = a.fabricate();

    return [first, second];
  };

  expect(run()).toEqual(run());
});

test("an instance's salt reproduces its run when replayed", () => {
  const first = initialize({ salt: randomSalt(), clock: "derived" });
  const run = new first.Fabricator(schema()).fabricate();

  const replayInstance = initialize({ salt: first.salt, clock: "derived" });
  const replay = new replayInstance.Fabricator(schema()).fabricate();

  expect(run).toEqual(replay);
});

test("a custom random factory drives every derived private salt", () => {
  const seedsReceived: Array<string> = [];

  const algorithm: Algorithm = (seed) => {
    seedsReceived.push(seed);
    return () => 0.25;
  };

  const instance = initialize({ salt: "abc", algorithm });
  new instance.Fabricator(T.number).fabricate();

  expect(seedsReceived.length).toBeGreaterThan(0);
});

test("a custom random factory composes with a salt and replays", () => {
  const algorithm: Algorithm = (seed) => {
    let i = String(seed).length % 100;

    return () => {
      i = (i + 7) % 100;
      return i / 100;
    };
  };

  const construct = (salt: string) => {
    const instance = initialize({ salt, algorithm, clock: "derived" });
    return new instance.Fabricator(schema());
  };

  const salt = randomSalt();
  const run = construct(salt).fabricate();
  const replay = construct(salt).fabricate();

  expect(run).toEqual(replay);
});

/**
 * `new Fabricator(schema, { salt })` — naming an explicit salt sidesteps
 * `construct()`'s default call-site attribution entirely (see
 * `Constructor.ts`'s `construct()` doc comment), unlike `options.algorithm`
 * below, which leaves attribution untouched.
 */
test("new Fabricator(schema, { salt }) gives every same-kind field its own draw", () => {
  /**
   * The bug this pins: the salted branch used to call `toStream(algorithm,
   * join(salt, kind))` fresh on every dispatch instead of caching/incrementing
   * per kind, so every field of the same kind read iteration 1 of an identical
   * stream and came out equal.
   */
  const { T, Fabricator } = initialize({ salt: "instance" });
  const built = new Fabricator(
    T.object({ a: T.number, b: T.number, c: T.number }),
    { salt: "collision-check" },
  ).fabricate();

  expect(new Set([built.a, built.b, built.c]).size).toBe(3);
});

test("new Fabricator(schema, { salt }) reproduces regardless of which file it's called from", () => {
  const { Fabricator } = initialize({ salt: "instance" });

  const here = fabricateSharedSchemaHere(Fabricator, { salt: "cross-file" });
  const there = new Fabricator(sharedSchema(), {
    salt: "cross-file",
  }).fabricate();
  expect(here).toEqual(there);

  /**
   * Without an explicit salt, the same two call sites fall back to ordinary
   * per-(relative file, kind) attribution and must diverge — otherwise the
   * assertion above wouldn't actually be exercising file-independence.
   */
  const hereUnseeded = fabricateSharedSchemaHere(Fabricator);
  const thereUnseeded = new Fabricator(sharedSchema()).fabricate();
  expect(hereUnseeded).not.toEqual(thereUnseeded);
});

/**
 * Pinned to the same explicit `clock` on both instances: a per-call salt forks
 * the source but keeps whichever clock the forked-from source already carries
 * (`Fabricator/Constructor.ts`'s `toConstructionContext`), so two instances
 * must also agree on their clock, not just the per-call salt, for this
 * independence to hold — otherwise each instance's own distinct default
 * `"derived"` clock (derived from "instance-a"/"instance-b" respectively) would
 * introduce a second, unrelated source of divergence.
 */
test("new Fabricator(schema, { salt }) is independent of the instance's own salt, given the same clock", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const a = initialize({ salt: "instance-a", clock });
  const b = initialize({ salt: "instance-b", clock });

  const one = new a.Fabricator(schema(), { salt: "shared" }).fabricate();
  const two = new b.Fabricator(schema(), { salt: "shared" }).fabricate();

  expect(one).toEqual(two);
});

test("new Fabricator(schema, { salt }) doesn't accumulate state across builds from the same instance", () => {
  const { Fabricator } = initialize({ salt: "instance" });

  const first = new Fabricator(schema(), { salt: "repeat" }).fabricate();

  /**
   * Interleave unrelated salted and unsalted builds between the two draws that
   * must match — if the unattributed stream cache ever migrated off its
   * per-build fork onto the shared instance source, this would perturb the
   * second draw below.
   */
  new Fabricator(schema(), { salt: "unrelated" }).fabricate();
  new Fabricator(schema()).fabricate();

  const second = new Fabricator(schema(), { salt: "repeat" }).fabricate();

  expect(first).toEqual(second);
});

test("bigint generation is reproducible under a salt", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const construct = (salt: string) => {
    const instance = initialize({ salt, clock });
    return new instance.Fabricator(
      T.object({
        value: T.number.integer.big.whereby({ max: BigInt(10) ** BigInt(30) }),
      }),
    );
  };

  expect(construct("5").fabricate()).toEqual(construct("5").fabricate());
  expect(construct("5").fabricate()).not.toEqual(construct("6").fabricate());
});

test("the built-in PRNG yields values in [0, 1)", () => {
  const stream = toStream(defaultAlgorithm, "range-check");
  for (let i = 0; i < 10_000; i++) {
    const x = stream.next();
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  }
});

test("construct() attributes randomness to wherever it's called, not to the Schema's declaration file", () => {
  /**
   * `sharedSchema()` constructs its Schema in fixtures/sharedSchema.ts, but a
   * Schema carries no construction-site information of its own — only
   * `construct()` binds randomness, and only at the moment it runs. Building it
   * from _this_ file, twice, from two fresh instances sharing a salt,
   * reproduces exactly — the schema's declaration site is irrelevant, only
   * construct()'s own call site matters.
   */
  const instanceA = initialize({ salt: "scoped", clock: "derived" });
  const sharedA = new instanceA.Fabricator(sharedSchema()).fabricate();

  const instanceB = initialize({ salt: "scoped", clock: "derived" });
  const sharedB = new instanceB.Fabricator(sharedSchema()).fabricate();

  expect(sharedA).toEqual(sharedB);
});

test("calling construct() again reproduces a schema imported from another file — no separate rebuild step needed", () => {
  const instanceA = initialize({ salt: "rebuilt", clock: "derived" });
  const a = new instanceA.Fabricator(sharedSchema()).fabricate();

  const instanceB = initialize({ salt: "rebuilt", clock: "derived" });
  const b = new instanceB.Fabricator(sharedSchema()).fabricate();

  expect(a).toEqual(b);
});

test(".extend() overrides survive construct() — the actual bug this refactor fixes", () => {
  /**
   * A hand-built custom `number` Schema, registered as an override the same way
   * a user's `.extend()` callback would. Today's getter-based registry
   * hardcoded `get number() { return number(); }`, reconstructing the original
   * built-in and silently ignoring any override — this is exactly the scenario
   * that broke.
   */
  const fixed = { [Kind]: "number" as const, [Meta]: { produce: () => 42 } };
  const T2 = registry.extend(() => ({ number: fixed }));

  const instance = initialize();
  expect(new instance.Fabricator(T2.number).fabricate()).toBe(42);
});

/**
 * Recording a trace is unconditional: a node that never draws still carries
 * `.trace`, so a nested `T.object` can be replayed from its own schema plus
 * that property. Guard on the kinds that never mint a stream.
 */
test("every kind carries a defined .trace, including nodes that never draw", () => {
  const { T, Fabricator } = initialize({ salt: "trace-none" });

  expect(new Fabricator(T.always(1)).trace).toBeDefined();
  expect(new Fabricator(T.null).trace).toBeDefined();
  expect(new Fabricator(T.symbol).trace).toBeDefined();
  expect(new Fabricator(T.undefined).trace).toBeDefined();
  expect(new Fabricator(T.tuple([T.always(1)])).trace).toBeDefined();
  expect(new Fabricator(T.object({ a: T.always(1) })).trace).toBeDefined();
});

/**
 * The positive counterpart to the test above: every kind's `.as(produce)` draws
 * this leaf's own salted stream to hand `produce`, so `.trace` is populated for
 * `symbol`/`tuple`/`object` on that path too — the same property as their bare
 * forms, with a stream behind it.
 */
test(".trace is defined for every kind's `.as(...)`-produced Fabricator", () => {
  const { T, Fabricator } = initialize({ salt: "trace-as" });

  expect(new Fabricator(T.boolean.as(() => true)).trace).toBeDefined();
  expect(new Fabricator(T.symbol.as(() => Symbol())).trace).toBeDefined();
  expect(new Fabricator(T.tuple([T.number]).as(() => [1])).trace).toBeDefined();
  expect(
    new Fabricator(T.object({ a: T.number }).as(() => ({ a: 1 }))).trace,
  ).toBeDefined();
});

/**
 * `RandomSource.fork` — added for `T.recursive`, whose own dispatch count is
 * data-dependent (how deep any given `fabricate()` call happens to go), unlike
 * every other kind's fixed, schema-determined dispatch count. Two forks of the
 * same salt must reproduce each other exactly, drawing successive values off
 * the _same_ stream — this is what a repeated `T.recursive` expansion actually
 * does, pulling one child salt after another from one construction's private
 * source.
 */
test("fork() produces an isolated source that replays from its own salt", () => {
  const parent = toRandomSource({ salt: "fork-parent", clock: 0 });

  const a = parent.fork("fork-child");
  const b = parent.fork("fork-child");

  const streamA = toStreamFromTrace(a.algorithm, {
    ...a.toRoot("unattributed"),
    path: [],
    kind: "number",
  });
  const streamB = toStreamFromTrace(b.algorithm, {
    ...b.toRoot("unattributed"),
    path: [],
    kind: "number",
  });

  const drawsA = Array.from({ length: 5 }, () => streamA.next());
  const drawsB = Array.from({ length: 5 }, () => streamB.next());

  expect(drawsA).toEqual(drawsB);
});

/**
 * A forked source's own per-file construction-ordinal counters must be entirely
 * private: heavy use of a child fork (many constructions, each bumping the
 * child's own counters) must never advance — or be advanced by — the parent's
 * counters, in either direction.
 */
test("fork() never perturbs, or is perturbed by, its parent's own streams", () => {
  const parent = toRandomSource({
    salt: "fork-isolation",
    attribution: { kind: "none" },
    clock: 0,
  });

  const child = parent.fork("unrelated-child-salt");
  for (let i = 0; i < 50; i++) {
    toStreamFromTrace(child.algorithm, {
      ...child.toRoot("attributed"),
      path: [],
      kind: "number",
    });
  }

  const afterForkUsage = toStreamFromTrace(parent.algorithm, {
    ...parent.toRoot("attributed"),
    path: [],
    kind: "number",
  }).seed;

  const control = toRandomSource({
    salt: "fork-isolation",
    attribution: { kind: "none" },
    clock: 0,
  });
  const untouched = toStreamFromTrace(control.algorithm, {
    ...control.toRoot("attributed"),
    path: [],
    kind: "number",
  }).seed;

  expect(afterForkUsage).toBe(untouched);
});

/**
 * A leaf's stream seed isn't merely _derived from_ its `Trace` — it _is_ the
 * encoding of it. This is what lets `Trace` carry no derived-seed field of its
 * own (see `Trace`'s own doc comment): every field a caller could want to
 * re-derive the stream from is already there.
 */
test("a leaf's stream seed is exactly the encoding of its own trace", () => {
  const source = toRandomSource({ salt: "trace-is-the-key", clock: 12345 });
  const root = source.toRoot("attributed");
  const trace = { ...root, path: ["field"], kind: "number" };
  const stream = toStreamFromTrace(source.algorithm, trace);

  expect(stream.seed).toBe(encode(trace));
});

/**
 * The clock is folded into `encode(trace)` (second slot, right after `salt`) —
 * a trace that omitted it couldn't account for its own output, since two runs
 * sharing an identical `.trace` could then produce different dates. Folding it
 * in means _every_ leaf's stream shifts with the clock, not just a `date`-kind
 * one — the direct guard that the slot actually participates in derivation, not
 * just that it's present on the type.
 */
test(".trace.clock is the resolved clock, and two instances differing only in clock diverge on a non-date field", () => {
  const a = initialize({
    salt: "clock-in-trace",
    clock: new Date("2000-01-01T00:00:00.000Z"),
  });
  const b = initialize({
    salt: "clock-in-trace",
    clock: new Date("2001-01-01T00:00:00.000Z"),
  });
  const c = initialize({
    salt: "clock-in-trace",
    clock: new Date("2000-01-01T00:00:00.000Z"),
  });

  const builtA = new a.Fabricator(a.T.number);
  const builtB = new b.Fabricator(b.T.number);
  const builtC = new c.Fabricator(c.T.number);

  expect(builtA.trace.clock).toBe(
    new Date("2000-01-01T00:00:00.000Z").getTime(),
  );

  const valueA = builtA.fabricate();
  expect(valueA).not.toBe(builtB.fabricate());
  expect(valueA).toBe(builtC.fabricate());
});

/**
 * `deriveClock`'s own throwaway encoding (`Random/index.ts`) is a two-element
 * JSON array (`[salt, "clock"]`), structurally distinct from a leaf's own
 * seven-element `encode(trace)` — the two can never collide onto the same
 * stream regardless of content, which is what lets the `"derived"` clock be
 * derived below `RandomSource` without perturbing, or being perturbed by, any
 * leaf's own draws.
 */
test('the "derived" clock is derived from a stream distinct from any leaf\'s own', () => {
  const { T, Fabricator, context } = initialize({
    salt: "clock-distinct-stream",
    clock: "derived",
  });

  const built = new Fabricator(T.number);
  const leafTrace = built.trace;

  expect(encode(leafTrace!)).not.toBe(JSON.stringify([context.salt, "clock"]));
});
