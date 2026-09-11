/**
 * The "adapter-authoring SDK" entry point — published as the
 * `@ghostry/fabricator/internal` package export, deliberately _not_ re-exported
 * from `./index.ts`. An external adapter package (e.g.
 * `@ghostry/fabricator-adapter-typebox-v0`) needs to walk a Schema/ Fabricator
 * structurally and dispatch on each primitive kind's `Core` shape — see "Match
 * `Core`, never `Schema`, in a dispatch" — which the end-user-facing `.` export
 * has no reason to carry.
 *
 * Also this package's own white-box test suite's route to source: a test file
 * imports through `@ghostry/fabricator`/ `@ghostry/fabricator/internal` rather
 * than a relative `../src/...` path specifically so it resolves through the
 * built `dist/` (see the "Random", "Schema", and "Enumeration" groups below) —
 * the same reason an adapter needs this entry point, applied to this package's
 * own tests instead of an external one.
 *
 * Everything here is curated, not incidental. When wiring a new leaf kind into
 * the rest of the system, add its module to `Primitive/namespace.ts`
 * (re-exported here as `Primitive`), or no adapter can reach that kind's `Core`
 * type.
 */
export type { Fabrication, NaiveFabricator } from "./Fabricator/Types";

/**
 * Schema -> the Fabricator type `construct()` produces for it, dispatching per
 * kind. `Constructor` already names this as its own construct signature's
 * return, but only _inside_ a generic call: a wrapping library that hands a
 * built Fabricator to its own callers has to name the type without making that
 * call, and cannot infer it back out of `Constructor` because the signature is
 * generic (a `Constructor extends { new (schema: $S, ...): infer $R }` match
 * instantiates at the constraint, not at `$S`).
 *
 * `@ghostry/extern-extension-fabricator-v0` is the case in point: it hands the
 * built Fabricator to a user callback as the shaping handle, so the handle's
 * type is exactly this. Without it, an integration is pushed into hand-writing
 * a per-kind stand-in — a second copy of this mapping, susceptible to drift.
 */
export type { AsFabricator } from "./Fabricator/Types";
export { Children, Kind, Meta, Produces, type Buildable } from "./Types";
export { isPlainObject } from "./Utility/Core";

export type * as Primitive from "./Primitive/namespace";

/**
 * `Schema/Types.ts`'s own value-type resolution, needed by tests asserting
 * `ValueOf<...>` directly rather than through a built Fabricator's
 * `Fabrication<...>`.
 */
export type { ValueOf } from "./Schema/Types";

/**
 * `Constructor` is `Instance.Fabricator`'s own type — public in effect (every
 * `initialize()` caller receives one), just never named directly by the `.`
 * export, which only ever describes it inline.
 */
export type { Constructor } from "./Fabricator/Constructor";

/**
 * The enumeration planner's own shapes — `combinatorial`/`coverage` (the `.`
 * export's public entry points) are built on `plan`/`resolve`, which a test
 * asserting `axisFor`'s per-kind width/strategy decisions needs directly.
 */
export { plan, resolve } from "./Enumeration/Plan";
export type { Axis, Enumerable, Pin, Resolvable } from "./Enumeration/Types";

/**
 * The randomness layer underneath `initialize({ clock, salt, algorithm })` and
 * a Fabricator's `.trace` — needed by tests exercising stream construction
 * directly, beneath the level `initialize()` itself exposes.
 */
export {
  defaultAlgorithm,
  encode,
  randomSalt,
  toRandomSource,
  toStream,
  toStreamFromTrace,
} from "./Random";
export type {
  Algorithm,
  ConstructionTrace,
  ConstructorOptions,
  RootPins,
  Salt,
  Trace,
} from "./Random/Types";

/**
 * The synchronous ambient carrier. `#stack` (`package.json`) selects it only
 * where there is no `node:async_hooks` — in practice a browser bundle — so on
 * Bun, Node, and Deno alike the condition always resolves to the
 * `AsyncLocalStorage` one instead. Exported for this package's own tests:
 * without it, neither the synchronous carrier's behavior nor `wrap`'s rejection
 * of an async block under it is reachable from the suite. It is also a
 * serviceable argument for `initialize({ stack })` for anyone who wants the old
 * semantics back deliberately.
 */
export { toStack as toSynchronousStack } from "./Instance/Stack/Sync";
