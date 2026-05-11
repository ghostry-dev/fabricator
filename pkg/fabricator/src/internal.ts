/**
 * The "adapter-authoring SDK" entry point — published as the
 * `@ghostry/fabricator/internal` package export, deliberately *not*
 * re-exported from `./index.ts`. An external adapter package (e.g.
 * `@ghostry/fabricator-adapter-typebox-v0`) needs to walk a Schema/
 * Fabricator structurally and dispatch on each primitive kind's `Core`
 * shape — see "Match `Core`, never `Schema`, in a dispatch" — which
 * the end-user-facing `.` export has no reason to carry.
 *
 * Also this package's own white-box test suite's route to source: a
 * test file imports through `@ghostry/fabricator`/
 * `@ghostry/fabricator/internal` rather than a relative `../src/...`
 * path specifically so it resolves through the built `dist/` (see the
 * "Random", "Schema", and "Enumeration" groups below) — the same
 * reason an adapter needs this entry point, applied to this package's
 * own tests instead of an external one.
 *
 * Everything here is curated, not incidental. When wiring a new leaf
 * kind into the rest of the system, add its module to
 * `Primitive/namespace.ts` (re-exported here as `Primitive`), or no
 * adapter can reach that kind's `Core` type.
 */
export type { Fabrication, NaiveFabricator } from "./Fabricator/Types";
export { Children, Kind, Meta, Produces, type Buildable } from "./Types";
export { isPlainObject } from "./Utility/Core";

export type * as Primitive from "./Primitive/namespace";

/**
 * `Schema/Types.ts`'s own value-type resolution, needed by tests
 * asserting `ValueOf<...>` directly rather than through a built
 * Fabricator's `Fabrication<...>`.
 */
export type { ValueOf } from "./Schema/Types";

/**
 * `Constructor` is `Instance.Fabricator`'s own type — public in effect
 * (every `initialize()` caller receives one), just never named
 * directly by the `.` export, which only ever describes it inline.
 */
export type { Constructor } from "./Fabricator/Constructor";

/**
 * The enumeration planner's own shapes — `combinatorial`/`coverage`
 * (the `.` export's public entry points) are built on `plan`/`resolve`,
 * which a test asserting `axisFor`'s per-kind width/strategy decisions
 * needs directly.
 */
export { plan, resolve } from "./Enumeration/Plan";
export type { Axis, Enumerable, Pin, Resolvable } from "./Enumeration/Types";

/**
 * The randomness layer underneath
 * `initialize({ seed, algorithm, attribution })` and a Fabricator's
 * `.trace` — needed by tests exercising stream attribution and
 * construction directly, beneath the level `initialize()` itself
 * exposes.
 */
export {
  defaultAlgorithm,
  encode,
  randomSeed,
  toRandomSource,
  toStream,
  toStreamFromTrace,
} from "./Random";
export type {
  Algorithm,
  ConstructionTrace,
  ConstructorOptions,
  ResolvedAttribution,
  RootKind,
  RootPins,
  Seed,
  Trace,
} from "./Random/Types";

/**
 * `Random/CallSite.ts`'s pure string helpers. Exported for this
 * package's own tests: the percent-encoded, `file://`-prefixed, and
 * backslashed spellings they exist to fold together cannot be produced
 * by running the suite from an ordinary POSIX checkout, so they have
 * to be driven with synthetic frame strings instead of real stack
 * frames.
 */
export { directoryOf, normalizeLocation, relativize } from "./Random/CallSite";
