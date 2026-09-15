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
 * **Mirrors the integration contract of `@ghostry/harness` 0.0.4.** Structural
 * satisfaction is what keeps the two packages independent, and it is also what
 * leaves nothing to check the pairing at install time: neither manifest names
 * the other, so a mismatched pair is caught by `tsc` at the point a consumer
 * passes `integration(instance)` to `initialize`, with an error about shapes
 * rather than about versions. This line is the only record of which version the
 * copy tracks, so move it whenever that contract does — the types below are
 * where the drift actually lives.
 *
 * @module
 */

/**
 * Decorate an existing `Instance` as a `@ghostry/harness` integration — `{
 * name, provides, frame }`. Takes an instance rather than minting one: the
 * caller owns `initialize(...)` (and in particular the suite-wide `clock`), and
 * this only wraps each test body in that instance's per-identity `wrap`.
 */
export { integration } from "./Harnessing/Core";

/**
 * `Identity` is what identifies one registered test or suite; `Integration` is
 * the `{ name, provides, frame }` shape `integration(instance)` returns —
 * `provides` is a `Provides<$Context, $Established>`, one `Provider` per
 * context key, each handed what the frame's wrapper established; `Frame` is the
 * generator `frame` returns and `Wrapper` the optional value it yields; both
 * hooks take a single object — `FrameArgs` for `frame`, and `ProviderArgs`, the
 * same thing plus `established`, for a provider; `FabricatorTestContext` is the
 * `{ fabricator }` slice of the test context this integration contributes.
 */
export type {
  FabricatorTestContext,
  Frame,
  FrameArgs,
  Identity,
  Integration,
  Provider,
  ProviderArgs,
  Provides,
  Wrapper,
} from "./Harnessing/Types";
