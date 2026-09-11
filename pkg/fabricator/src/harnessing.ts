/**
 * The `@ghostry/fabricator/harnessing` package export — what supplying a
 * `@ghostry/harness` integration is built from. Named for the activity, the
 * same pattern `@ghostry/fabricator/adapting` follows.
 *
 * Deliberately separate from the `.` export: `.` is for using fabricator,
 * `./adapting` is implementing a schema adapter, `./internal` is the
 * structural-walking tools an adapter needs, and this is the contract a
 * test-framework wrapping library drives. Fabricator declares no dependency and
 * no peer on `@ghostry/harness`; the types here describe the part of that
 * package's contract this integration uses, satisfied structurally, so neither
 * depends on the other.
 *
 * @module
 */

/**
 * Decorate an existing `Instance` as a `@ghostry/harness` integration — `{
 * name, provides, around }`. Takes an instance rather than minting one: the
 * caller owns `initialize(...)` (and in particular the suite-wide `clock`), and
 * this only wraps each test body in that instance's per-identity `wrap`.
 */
export { integration } from "./Harnessing/Core";

/**
 * `Identity` is what identifies one registered test or suite; `Integration` is
 * the `{ name, provides, around }` shape `integration(instance)` returns —
 * `provides` is a `Provides<$Context>`, one `Provider` per context key;
 * `FabricatorTestContext` is the `{ fabricator }` slice of the test context
 * this integration contributes.
 */
export type {
  FabricatorTestContext,
  Identity,
  Integration,
  Provider,
  Provides,
} from "./Harnessing/Types";
