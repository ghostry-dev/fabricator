/**
 * The `@ghostry/fabricator/adapting` package export — what implementing a
 * schema adapter (e.g. `@ghostry/fabricator-adapter-typebox-v0`) is built from.
 * Named for the activity, not the noun (`Adapter` is one export among several
 * here) — the same pattern `@ghostry/fabricator/harnessing` follows for
 * supplying a test-framework integration.
 *
 * Deliberately separate from the `.` export: `.` is for using fabricator,
 * `./internal` is the structural-walking tools an adapter needs (`Kind`,
 * `Meta`, `Primitive`, `Buildable`), and this is the contract an adapter
 * declares and drives. `Adapting` — the parameter type of every kind's
 * `.adapt(adapter, produce)` producer — stays on `.` instead, despite the name
 * overlap with this module: calling `.adapt()` is an ordinary caller's
 * business, not an adapter author's, the same reason `Stream`/`ProduceContext`
 * live there for `.as(produce)`.
 *
 * This package names no external schema library and depends on none: every
 * mapping, and every dependency it needs, belongs to the adapter.
 *
 * @module
 */

export { walk } from "./Adapter/Core";

/**
 * `Adapter`/`Recurse` are what an adapter declares; `AdaptationsOf` is how it
 * reads what a Schema declared at the type level, keyed by its own `key`.
 */
export type {
  Adaptations,
  AdaptationsOf,
  Adapter,
  Recurse,
} from "./Adapter/Types";

/**
 * What `[Adaptation]` holds at runtime — a per-adapter map of overrides, read
 * only by an adapter.
 */
export { Adaptation } from "./Types";
