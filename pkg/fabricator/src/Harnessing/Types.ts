import type { Instance } from "../Instance/Types";
import type { PlainObject } from "../Utility/Types";

/**
 * What identifies one registered test or suite — the material a salt is derived
 * from. Named to match how this codebase already talks about the concept:
 * fabricator's own reproducibility guide reaches for `layer(...)` for "a tenant
 * id, a test's own name" — this is that identity, structured.
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
 */
export type Provider<$Value> = (identity: Identity) => $Value;

/**
 * The keys an integration contributes, and how each is produced. Homomorphic
 * over `$Context`, so the context an integration contributes is read back out
 * of this object's shape with no separate key declaration to keep in sync.
 */
export type Provides<$Context extends object> = {
  readonly [$Key in keyof $Context]: Provider<$Context[$Key]>;
};

/**
 * What `integration(instance)` is, as `@ghostry/harness`'s `initialize` sees
 * it. The subset of that package's contract this integration actually uses, not
 * a copy of all of it: `@ghostry/harness` also accepts an optional `setup`,
 * which fabricator has no teardown to put in, and an object lacking an optional
 * member still satisfies the contract structurally. `around` is required here,
 * though optional there, because this integration always declares it.
 *
 * `provides` is the _only_ source of context keys; `initialize` rejects a
 * collision across integrations by reading `Object.keys(provides)`. Each
 * provider runs inside its integration's `around`. `around` is generic in its
 * return and must return the body's value unchanged: that is what makes async
 * work and what lets frames nest.
 */
export type Integration<$Context extends object> = {
  readonly name: string;
  readonly provides: Provides<$Context>;
  around<$Return>(identity: Identity, body: () => $Return): $Return;
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
