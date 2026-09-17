import { FabricatorError, initialize, layer } from "@ghostry/fabricator";
import {
  integration,
  type FabricatorTestContext,
  type Identity,
} from "@ghostry/fabricator/harnessing";
import { expect, test } from "bun:test";
import {
  compose,
  run,
  toIdentity,
  type AnyIntegration,
} from "./fixtures/harnessingConsumer";

/**
 * One shared, plausible "now" — the recommended setup. Salt varies per
 * identity; clock does not. Tests that specifically compare `"derived"` clocks
 * are the exception.
 */
const CLOCK = new Date("2024-01-01T00:00:00.000Z");

const idA = toIdentity({ path: ["suite"], name: "a", kind: "test" });
const idB = toIdentity({ path: ["suite"], name: "b", kind: "test" });

test("the same Identity replays identical data across runs", () => {
  const instance = initialize({ salt: "testing-replay", clock: CLOCK });
  const wired = integration(instance);
  const draw = () =>
    run(wired, idA, ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );

  expect(draw()).toBe(draw());
});

test("identities differing only in name, only in path, or only in row differ", () => {
  const instance = initialize({ salt: "testing-differ", clock: CLOCK });
  const wired = integration(instance);
  const draw = (identity: Parameters<typeof run>[1]) =>
    run(wired, identity, ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );

  const base = { path: ["outer", "inner"], name: "x", kind: "test" } as const;

  expect(draw(toIdentity({ ...base, name: "a" }))).not.toBe(
    draw(toIdentity({ ...base, name: "b" })),
  );
  expect(draw(toIdentity({ ...base, path: ["outer"] }))).not.toBe(
    draw(toIdentity({ ...base, path: ["outer", "other"] })),
  );
  expect(draw(toIdentity({ ...base, row: 0 }))).not.toBe(
    draw(toIdentity({ ...base, row: 1 })),
  );
  expect(draw(toIdentity({ ...base, row: 0 }))).not.toBe(
    draw(toIdentity(base)),
  );
});

/**
 * The accepted cost of carrying no file in the salt: identity is the test path
 * and nothing else, so two tests that agree on `kind`, `path`, and `name` draw
 * the same data no matter which files they live in. Each stays deterministic;
 * they share a universe. Pinned so it reads as the documented trade rather than
 * a regression — see `saltFor` (`src/Harnessing/Salt.ts`).
 */
test("identity is the test path alone — the file plays no part", () => {
  const instance = initialize({ salt: "testing-path-only", clock: CLOCK });
  const wired = integration(instance);
  const shared = {
    path: ["suite"],
    name: "same",
    row: undefined,
    kind: "test",
  } as const;

  const draw = () =>
    run(wired, toIdentity(shared), ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );

  expect(draw()).toBe(draw());
});

test('a "suite" identity is stable and distinct from every "test" identity under it', () => {
  const instance = initialize({ salt: "testing-suite", clock: CLOCK });
  const wired = integration(instance);
  const suite = toIdentity({ path: ["outer"], name: "", kind: "suite" });
  const testA = toIdentity({ path: ["outer"], name: "a", kind: "test" });
  const testB = toIdentity({ path: ["outer"], name: "b", kind: "test" });
  /**
   * `path` never carries a leaf's own name, so without `kind` in the salt this
   * identity would be indistinguishable from `suite` above — same `path`, same
   * empty `name`. No framework forbids naming a test `""`.
   */
  const emptyNamedTest = toIdentity({
    path: ["outer"],
    name: "",
    kind: "test",
  });

  const draw = (identity: typeof suite) =>
    run(wired, identity, ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );

  expect(draw(suite)).toBe(draw(suite));
  expect(draw(suite)).not.toBe(draw(testA));
  expect(draw(suite)).not.toBe(draw(testB));
  expect(draw(suite)).not.toBe(draw(emptyNamedTest));
});

/**
 * The one collision `kind` does not close, and is not meant to: a suite's setup
 * and teardown share one deterministic scope by default. A caller who wants
 * them isolated already has the tool — `instance.wrap(...)` inside the hook
 * body, explicitly.
 */
test('two "suite" identities at the same path share one salt', () => {
  const instance = initialize({ salt: "testing-suite-shared", clock: CLOCK });
  const wired = integration(instance);
  const beforeAll = toIdentity({ path: ["outer"], name: "", kind: "suite" });
  const afterAll = toIdentity({ path: ["outer"], name: "", kind: "suite" });

  const draw = (identity: typeof beforeAll) =>
    run(wired, identity, ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );

  expect(draw(beforeAll)).toBe(draw(afterAll));
});

/**
 * The analogue of `Wrap.test.ts`'s first assertion: inside one `run`,
 * construction reached implicitly (through the caller's `instance`) and
 * explicitly (through `context.fabricator`) must share one source.
 */
test("ambient and injected access agree inside one run", () => {
  const instance = initialize({ salt: "testing-ambient", clock: CLOCK });
  const wired = integration(instance);

  const interleaved: number[] = [];
  run(wired, idA, ({ fabricator }) => {
    interleaved.push(new instance.Fabricator(instance.T.number).fabricate());
    interleaved.push(
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );
    interleaved.push(new instance.Fabricator(instance.T.number).fabricate());
  });

  const allViaContext: number[] = [];
  run(wired, idA, ({ fabricator }) => {
    allViaContext.push(
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );
    allViaContext.push(
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );
    allViaContext.push(
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );
  });

  expect(interleaved).toEqual(allViaContext);
});

test("run returns the body's value, including a promise, and the frame survives an await", async () => {
  const instance = initialize({ salt: "testing-return", clock: CLOCK });
  const wired = integration(instance);

  expect(run(wired, idA, () => 42)).toBe(42);

  const promised = run(wired, idA, async () => 7);
  expect(typeof promised.then).toBe("function");
  expect(await promised).toBe(7);

  await run(wired, idA, async ({ fabricator }) => {
    const during = fabricator.context.salt;
    await Promise.resolve();
    expect(instance.context.salt).toEqual(during);
    expect(new instance.Fabricator(instance.T.number).trace.salt).toEqual(
      during,
    );
  });
});

test("construction ordinals restart per run, so registration order is irrelevant", () => {
  const instance = initialize({ salt: "testing-ordinals", clock: CLOCK });
  const wired = integration(instance);

  const ordinals = (identity: typeof idA) =>
    run(wired, identity, ({ fabricator }) => [
      new fabricator.Fabricator(fabricator.T.number).trace.ordinal,
      new fabricator.Fabricator(fabricator.T.number).trace.ordinal,
    ]);

  expect(ordinals(idA)).toEqual([0, 1]);
  expect(ordinals(idB)).toEqual([0, 1]);

  const draw = (identity: typeof idA) =>
    run(wired, identity, ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number).fabricate(),
    );

  const aThenB = [draw(idA), draw(idB)];
  const bThenA = [draw(idB), draw(idA)];

  expect(aThenB[0]).toBe(bThenA[1]);
  expect(aThenB[1]).toBe(bThenA[0]);
});

test("the salt composes onto initialize({ salt }) rather than replacing it", () => {
  const instance = initialize({ salt: "testing-salt-shape", clock: CLOCK });
  const wired = integration(instance);
  const identity = toIdentity({
    path: ["outer", "inner"],
    name: "does a thing",
    row: 2,
    kind: "test",
  });

  run(wired, identity, ({ fabricator }) => {
    /**
     * The instance's own salt first, then the identity's — nothing else. No
     * leading file segment, and no path of any kind anywhere in the array.
     */
    expect(fabricator.context.salt).toEqual([
      "testing-salt-shape",
      "test",
      "outer",
      "inner",
      "does a thing",
      "2",
    ]);
  });
});

test("a construction's salt: layer(...) composes onto the test identity, while a bare { salt } replaces it", () => {
  const instance = initialize({
    salt: "testing-construction-salt",
    clock: CLOCK,
  });
  const wired = integration(instance);

  const layered = (identity: typeof idA) =>
    run(wired, identity, ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number, {
        salt: layer("fixed"),
      }).fabricate(),
    );

  expect(layered(idA)).not.toBe(layered(idB));

  const bare = (identity: typeof idA) =>
    run(wired, identity, ({ fabricator }) =>
      new fabricator.Fabricator(fabricator.T.number, {
        salt: "fixed",
      }).fabricate(),
    );

  /**
   * Same file, same bare salt, ordinals restart per `run` — so both identities
   * resolve to the same trace. Pre-existing `resolveScope` semantics; per-test
   * wraps make the collision reachable.
   */
  expect(bare(idA)).toBe(bare(idB));
});

/**
 * The pair that keeps a later "helpful" clock override from being added: a
 * pinned `Date` is one suite-wide instant; `"derived"` follows the composed
 * salt and is therefore per-identity.
 */
test('under clock: "derived", two identities resolve different clocks; under a pinned Date, the same one', () => {
  const pinned = initialize({ salt: "testing-clock-pinned", clock: CLOCK });
  const clockOf = (
    instance: ReturnType<typeof initialize>,
    identity: typeof idA,
  ) =>
    run(
      integration(instance),
      identity,
      ({ fabricator }) => fabricator.context.clock,
    );

  expect(clockOf(pinned, idA)).toBe(CLOCK.getTime());
  expect(clockOf(pinned, idB)).toBe(CLOCK.getTime());

  const derived = initialize({
    salt: "testing-clock-derived",
    clock: "derived",
  });
  expect(clockOf(derived, idA)).not.toBe(clockOf(derived, idB));
});

/**
 * `@ghostry/harness` reads `Object.keys(provides)` for its eager collision
 * check — there is no separate key declaration, so this is the whole of what
 * the integration claims to contribute.
 */
test("provides contributes exactly the fabricator key", () => {
  const wired = integration(initialize({ salt: "testing-keys", clock: CLOCK }));

  expect(Object.keys(wired.provides)).toEqual(["fabricator"]);
});

test("the provided fabricator is the per-test scope, not the base instance", () => {
  const instance = initialize({ salt: "testing-scope", clock: CLOCK });
  const wired = integration(instance);

  run(wired, idA, ({ fabricator }) => {
    expect(fabricator).not.toBe(instance);
    expect(fabricator.salt).toEqual(["testing-scope", "test", "suite", "a"]);
    expect(instance.salt).toEqual(["testing-scope"]);
  });
});

/**
 * Two interleaved async bodies must each keep the scope they were handed. Once
 * the frame's wrapper passes its scope forward and the provider receives it as
 * `established`, that holds by construction: there is no slot for a second test
 * to overwrite between the wrapper opening and the provider reading.
 */
test("concurrent runs each keep their own scope across an await", async () => {
  const instance = initialize({ salt: "testing-concurrent", clock: CLOCK });
  const wired = integration(instance);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const observe = (identity: Identity) =>
    run(wired, identity, async ({ fabricator }) => {
      await gate;
      return { provided: fabricator.salt, ambient: instance.context.salt };
    });

  const a = observe(idA);
  const b = observe(idB);
  release();

  const expectedA = ["testing-concurrent", "test", "suite", "a"];
  const expectedB = ["testing-concurrent", "test", "suite", "b"];

  expect(await a).toEqual({ provided: expectedA, ambient: expectedA });
  expect(await b).toEqual({ provided: expectedB, ambient: expectedB });
});

test("the provider outside a frame raises HarnessingProviderError, including after a run", () => {
  const wired = integration(
    initialize({ salt: "testing-provider-outside", clock: CLOCK }),
  );

  /** A composer that runs providers outside the frame establishes nothing. */
  const outside = wired.provides.fabricator as (args: {
    readonly identity: Identity;
    readonly established?: unknown;
  }) => unknown;

  expect(() => outside({ identity: idA })).toThrow(
    FabricatorError.HarnessingProviderError,
  );

  run(wired, idA, () => undefined);

  expect(() => outside({ identity: idA })).toThrow(
    FabricatorError.HarnessingProviderError,
  );
});

test("an outer integration's frame nests around fabricator's, and the body's value returns unchanged", () => {
  const instance = initialize({ salt: "testing-nesting", clock: CLOCK });
  const log: string[] = [];

  const outer: AnyIntegration = {
    name: "outer",
    provides: { label: ({ identity }) => identity.name },
    *frame() {
      log.push("open");
      try {
        yield;
      } finally {
        log.push("close");
      }
    },
  };

  const result = compose(
    [outer, integration(instance)],
    idA,
    (context: { readonly label: string } & FabricatorTestContext) => {
      log.push("body");
      return [context.label, context.fabricator.context.salt] as const;
    },
  );

  expect(log).toEqual(["open", "body", "close"]);
  expect(result).toEqual(["a", ["testing-nesting", "test", "suite", "a"]]);
});

/**
 * The instance handed to `integration(...)` need not be a lineage root. A
 * caller may fork an application-wide configuration and treat that fork as
 * _their_ root — destructuring `Fabricator` off it and never touching the
 * instance `initialize()` returned.
 *
 * Ambience has to reach that fork, and reach it through its own destructured
 * `Fabricator`, or per-test partitioning silently stops working for exactly the
 * setup a careful user is most likely to write. The frame is keyed on the
 * instance `wrap` was called on — the fork — so the fork is its own origin and
 * resolves against it; the lineage root, being an ancestor, resolves against it
 * too.
 *
 * Pinned because every other test in this file wires a root, which would leave
 * this case uncovered.
 */
test("a non-root instance handed to integration() is still reached by ambience, through its own destructured Fabricator", () => {
  const root = initialize({ salt: "testing-non-root", clock: CLOCK });
  const testing = root.fork({ salt: layer("testing") });

  /** The user's own "root": nothing below ever names `root` again. */
  const { Fabricator, T } = testing;

  const seen = run(integration(testing), idA, ({ fabricator }) => ({
    provided: fabricator.salt,
    ambientOnTheFork: testing.context.salt,
    ambientOnTheRoot: root.context.salt,
    builtOnTheFork: new Fabricator(T.number).trace.salt,
  }));

  const expected = ["testing-non-root", "testing", "test", "suite", "a"];

  expect(seen).toEqual({
    provided: expected,
    ambientOnTheFork: expected,
    ambientOnTheRoot: expected,
    builtOnTheFork: expected,
  });
});

/**
 * The per-test overlay lays over the frame in effect, not over the instance
 * `integration(...)` was handed. That receiver is bound before any test runs,
 * so overlaying it would restate from the configured instance and drop an
 * enclosing scope entirely — silently, and while still landing innermost and
 * therefore governing every draw, since a construction resolves against the
 * innermost frame on the stack rather than the instance it was built from.
 *
 * Reachable whenever another library opens a fabricator scope around the body:
 * `@ghostry/extern`'s fabricator extension does exactly that, and which of the
 * two lands innermost is decided by the order the integrations were registered
 * in. Composing here is what makes that order a choice of layer order rather
 * than a behavioral difference.
 */
test("the per-test salt composes onto an enclosing scope rather than replacing it", () => {
  const instance = initialize({ salt: "testing-enclosing", clock: CLOCK });
  const wired = integration(instance);

  instance.wrap({ salt: layer("enclosing") }, () => {
    run(wired, idA, ({ fabricator }) => {
      expect(fabricator.context.salt).toEqual([
        "testing-enclosing",
        "enclosing",
        "test",
        "suite",
        "a",
      ]);
    });

    /** Per-test partitioning is unaffected by the enclosing layer. */
    const draw = (identity: typeof idA) =>
      run(wired, identity, ({ fabricator }) =>
        new fabricator.Fabricator(fabricator.T.number).fabricate(),
      );

    expect(draw(idA)).not.toBe(draw(idB));
    expect(draw(idA)).toBe(draw(idA));
  });
});

/**
 * The per-test wrap is entered on `context.scope()`, so it governs that
 * instance and its ancestors — never a fork of the integrated instance. A
 * `fork()` taken off the base instance inside a composed test draws its own
 * configuration, not the enclosing salt and not the per-test identity.
 */
test("under composition a fork of the integrated instance is not governed at all", () => {
  const instance = initialize({ salt: "testing-collateral", clock: CLOCK });
  const wired = integration(instance);

  instance.wrap({ salt: layer("enclosing") }, () => {
    run(wired, idA, () => {
      expect(instance.context.salt).toEqual([
        "testing-collateral",
        "enclosing",
        "test",
        "suite",
        "a",
      ]);

      expect(instance.fork().context.salt).toEqual(["testing-collateral"]);
    });
  });
});

/**
 * Per-test data comes from the integrated instance, `context.fabricator`, or a
 * fork of that scope. A module-level fork draws the same salt in every test,
 * and because its construction counter runs across tests, which values a test
 * gets depends on which tests ran before it — nothing detects this; it presents
 * as tests colliding as a suite and passing under `.only`. A `fork()` of the
 * integrated instance taken inside the test likewise misses the per-test
 * identity. That is the documented consequence of the receiver-and-ancestors
 * rule, not a defect.
 */
test("per-test data comes from the integrated instance or a fork of its scope, not a module-level or bare fork", () => {
  const fabricator = initialize({ salt: "suite", clock: CLOCK });
  const A = fabricator.fork({ salt: layer("A") });
  const wired = integration(fabricator);
  const alpha = toIdentity({ path: [], name: "alpha", kind: "test" });
  const beta = toIdentity({ path: [], name: "beta", kind: "test" });

  const observed = (identity: Identity) =>
    run(wired, identity, ({ fabricator: scope }) => {
      const integrated = new fabricator.Fabricator(fabricator.T.number);
      const moduleLevelBuild = new A.Fabricator(A.T.number);
      return {
        integrated: integrated.trace.salt,
        integratedOrdinal: integrated.trace.ordinal,
        provided: new scope.Fabricator(scope.T.number).trace.salt,
        moduleLevel: moduleLevelBuild.trace.salt,
        moduleLevelOrdinal: moduleLevelBuild.trace.ordinal,
        bare: fabricator.fork({ salt: layer("B") }).context.salt,
        scoped: scope.fork({ salt: layer("B") }).context.salt,
      };
    });

  const a = observed(alpha);
  expect(a.integrated).toEqual(["suite", "test", "alpha"]);
  expect(a.provided).toEqual(["suite", "test", "alpha"]);
  expect(a.moduleLevel).toEqual(["suite", "A"]);
  expect(a.bare).toEqual(["suite", "B"]);
  expect(a.scoped).toEqual(["suite", "test", "alpha", "B"]);
  expect(a.integratedOrdinal).toBe(0);
  expect(a.moduleLevelOrdinal).toBe(0);

  const b = observed(beta);
  expect(b.integrated).toEqual(["suite", "test", "beta"]);
  expect(b.moduleLevel).toEqual(["suite", "A"]);
  expect(b.bare).toEqual(["suite", "B"]);
  expect(b.scoped).toEqual(["suite", "test", "beta", "B"]);
  expect(b.integratedOrdinal).toBe(0);
  expect(b.moduleLevelOrdinal).toBe(1);
});

/**
 * `clock` is still never set here — it is inherited, and the frame in effect is
 * now part of what it inherits from. A caller who wrapped a different instant
 * around a group of tests gets that instant inside them, rather than having the
 * per-test scope silently revert to the instance's own.
 */
test("clock inherits from the frame in effect, and is still never set here", () => {
  const instance = initialize({ salt: "testing-clock-frame", clock: CLOCK });
  const enclosing = new Date("2030-06-01T00:00:00.000Z");

  instance.wrap({ clock: enclosing }, () => {
    run(integration(instance), idA, ({ fabricator }) => {
      expect(fabricator.context.clock).toBe(enclosing.getTime());
    });
  });

  /** Outside any frame, the instance's own clock, exactly as before. */
  run(integration(instance), idA, ({ fabricator }) => {
    expect(fabricator.context.clock).toBe(CLOCK.getTime());
  });
});
