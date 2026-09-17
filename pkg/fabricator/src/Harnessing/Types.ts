import type { Instance } from "../Instance/Types";
import type { PlainObject } from "../Utility/Types";

/**
 * What identifies one registered test or suite — the material a salt is derived
 * from. Named to match how this codebase already talks about the concept:
 * fabricator's own reproducibility guide reaches for `layer(...)` for "a test's
 * own name" — this is that identity, structured.
 *
 * Declared here rather than imported from `@ghostry/harness`, so neither
 * package depends on the other — the same arrangement `Adapter`/`walk` already
 * uses for schema adapters. Satisfied structurally.
 *
 * **Carries no file, deliberately.** Nothing here identifies where the test was
 * registered, which is what lets `@ghostry/harness` skip stack walking entirely
 * — see `saltFor` (`Harnessing/Salt.ts`) for why the file turned out to be
 * redundant against per-test `wrap` partitioning. The consequence for the
 * contract: an integration that genuinely needs the registering file cannot get
 * it from here, and adding it back means solving the frame-skip problem for
 * every wrapper between the user's `it(...)` and the integration. Worth
 * revisiting only against a real requirement, not speculatively.
 */
export type Identity = {
  /**
   * Disambiguates an empty-named test from its enclosing suite scope — `name`
   * is `""` for both, and `path` never carries a leaf's own name. Two suite
   * identities that share a `path` (`beforeAll` and `afterAll` in one
   * `describe`) are not disambiguated by this: that collision is intentional
   * (see `saltFor`, `Harnessing/Salt.ts`).
   */
  readonly kind: "test" | "suite";
  /** Enclosing describe names, outer → inner. */
  readonly path: ReadonlyArray<string>;
  /** The test name; empty for a suite-scoped callback. */
  readonly name: string;
  /** `.each` row index (0-based), `undefined` when the test is not from `.each`. */
  readonly row: number | undefined;
};

/**
 * One context key's value, as a function of the test's `Identity` rather than a
 * fixed value.
 *
 * `established` is whatever this integration's own wrapper handed forward. For
 * this integration that is the scoped `Instance` `wrap` opened, which is the
 * whole of what `provides.fabricator` returns — so the value travels from the
 * wrapper to the provider directly, with no mutable slot written on the way in
 * and read on the way out.
 */
export type Provider<$Value, $Established = void> = (
  args: ProviderArgs<$Established>,
) => $Value;

/**
 * What `@ghostry/harness` hands {@link Integration.frame}: one object, never
 * positional arguments, so a field added to the contract later is a key an
 * existing hook ignores rather than a parameter it has to thread past.
 */
export type FrameArgs = { readonly identity: Identity };

/**
 * What it hands each provider: everything {@link FrameArgs} carries, plus what
 * this integration's own wrapper established — for this integration, the scoped
 * `Instance` that `wrap` opened.
 */
export type ProviderArgs<$Established = void> = FrameArgs & {
  readonly established: $Established;
};

/**
 * The keys an integration contributes, and how each is produced. Homomorphic
 * over `$Context`, so the context an integration contributes is read back out
 * of this object's shape with no separate key declaration to keep in sync.
 */
export type Provides<$Context extends object, $Established = void> = {
  readonly [$Key in keyof $Context]: Provider<$Context[$Key], $Established>;
};

/**
 * How an integration runs the body when the body must run _inside_ something.
 * Here that is fabricator's own `wrap`, whose block parameter is already this
 * shape — the scoped `Instance` it opens is what reaches `body`, and therefore
 * what reaches the providers.
 *
 * Generic in its return and must hand the body's value back unchanged: that is
 * what keeps a synchronous test synchronous and what lets frames nest.
 */
export type Wrapper<$Established = void> = <$Return>(
  body: (established: $Established) => $Return,
) => $Return;

/**
 * What {@link Integration.frame} returns: a generator with **one** suspension
 * point. Everything before the `yield` is setup, the body runs at the `yield`,
 * and everything after it is teardown, resumed when the body _settles_.
 *
 * `@ghostry/harness` accepts an `AsyncGenerator` here too. This declares only
 * the synchronous half, because that is the half this integration uses and the
 * narrower type still satisfies the wider one — the same reason `frame` is
 * required below though it is optional there. Opening a fabricator scope is
 * synchronous, and declaring the async arm would invite an integration that
 * promotes every test in the suite to a promise for no reason.
 */
export type Frame<$Established = void> = Generator<
  Wrapper<$Established> | void,
  void,
  unknown
>;

/**
 * What `integration(instance)` is, as `@ghostry/harness`'s `initialize` sees
 * it. The subset of that package's contract this integration actually uses, not
 * a copy of all of it: an object lacking an optional member still satisfies the
 * contract structurally, so `frame` is required here though optional there,
 * because this integration always declares it.
 *
 * `provides` is the _only_ source of context keys; `initialize` rejects a
 * collision across integrations by reading `Object.keys(provides)`. Each
 * provider runs _inside_ that frame and receives the same `$Established` the
 * wrapper handed to the body.
 */
export type Integration<$Context extends object, $Established = void> = {
  readonly name: string;
  readonly provides: Provides<$Context, $Established>;
  frame(args: FrameArgs): Frame<$Established>;
};

/**
 * The slice of the test context `integration(instance)` contributes — one key,
 * `fabricator`, holding the per-test scoped `Instance`. The same instance is
 * also ambient for the body's duration (`instance.wrap`), so a body that
 * ignores this and uses the caller's own `instance` still sees the per-test
 * salt.
 */
export type FabricatorTestContext<$Registry extends PlainObject = PlainObject> =
  { readonly fabricator: Instance<$Registry> };
