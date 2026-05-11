import type { Enumerable, Limits } from "../Enumeration/Types";
import type { Constructor } from "../Fabricator/Constructor";
import type {
  Algorithm,
  Attribution,
  Layered,
  RandomSource,
  Seed,
} from "../Random/Types";
import type { PlainObject } from "../Utility/Types";

/**
 * A fully resolved instance configuration — every field present, nothing
 * left to default. `Overlay` is what `fork` accepts; `overlay()`
 * (`Instance/Core.ts`) is the only thing producing a complete `Config`.
 *
 * Two fields are declared at their caller-facing type but always hold
 * their resolved form once `overlay()` has run: `seed` is `Seed` because
 * that is what a caller may supply, but always holds the normalized
 * array (`Instance.seed` is the authoritative read); `attribution` is
 * `Attribution` for the same reason but always holds a
 * `ResolvedAttribution`, a subtype. `clock` is different from both:
 * unlike `seed`/`attribution`, it holds *either* a resolved instant
 * (epoch milliseconds) or the unresolved `"seeded"` policy — never
 * collapsed to a number by `overlay()` when `"seeded"`, because that
 * policy must re-derive whenever the seed it composes changes (a
 * `fork({ seed: layer(...) })`). The unconfigured default is a wall-
 * clock number, inherited as-is like an explicit `Date`. `resolveClock`
 * (`Instance/Core.ts`) is the one place that resolves `"seeded"` to a
 * number, called fresh wherever the clock actually matters
 * (`instantiate`, the `context.clock` getter) rather than once here.
 */
export type Config<$Registry extends PlainObject> = {
  readonly seed: Seed;
  readonly algorithm: Algorithm;
  readonly attribution: Attribution;
  readonly types: $Registry;
  readonly limits: Limits;
  readonly clock: number | "seeded";
};

/**
 * What `fork` accepts — a `Config` to lay over a base, every field
 * optional. Identical to `Partial<Config>` but for `seed`, which
 * additionally accepts a {@link Layered}: a bare `Seed` replaces the
 * base's seed outright (what `seed` means everywhere else in this
 * library), `layer(seed)` appends onto it (`[...base.seed, ...seed]`)
 * — the shape a wrapping integration wants, and what
 * `ConstructorOptions`' layered form is for a single construction.
 * Omitting `seed` inherits the base's unchanged. `clock` similarly
 * accepts the caller-facing `Date | "seeded"` rather than `Config`'s
 * own resolved `number | "seeded"`, so a caller can hand in a literal
 * instant without converting it to epoch milliseconds themselves.
 * `"seeded"` is the explicit opt-in that derives "now" from the
 * instance seed; omitting `clock` at the root captures wall-clock time
 * instead.
 *
 * `initialize`'s own parameter keeps a plain `seed?: Seed`, so passing
 * `layer(...)` there is a compile error: there is no base to layer onto
 * at the root.
 */
export type Overlay<$Registry extends PlainObject> = Partial<
  Omit<Config<$Registry>, "seed" | "clock">
> & {
  readonly seed?: Seed | Layered;
  readonly clock?: Date | "seeded" | undefined;
};

/**
 * One active `wrap` — its resolved config plus the single `RandomSource`
 * every build reached inside that `wrap` shares, whether reached
 * implicitly (any instance in the lineage consulting the active frame)
 * or explicitly (`scope.Fabricator`, the `Instance` passed to the
 * block). Storing the scope's own already-built `source` here, rather
 * than each consumer re-deriving one from `config`, keeps the two
 * routes resolving against the *same* source — sharing one set of
 * construction-ordinal counters — instead of each silently starting
 * its own.
 */
export type Frame = {
  readonly config: Config<PlainObject>;
  readonly source: RandomSource;
};

/**
 * The per-lineage ambient stack. Created once at a root `initialize()`
 * and threaded — never re-created — through every `fork`/`wrap`
 * descended from it (see `instantiate`, `Instance/Core.ts`). Two
 * unrelated `initialize()` calls stay fully isolated; one lineage's
 * `wrap` reaches every instance in that lineage — its `Fabricator`,
 * `combinatorial`, and `coverage` alike — regardless of where in the
 * lineage that instance was itself created.
 */
export type Stack = {
  current(): Frame | undefined;

  /**
   * Push `frame`, run `block`, pop — in a `finally`, so a frame unwinds
   * correctly even if `block` throws.
   */
  enter<$Return>(frame: Frame, block: () => $Return): $Return;
};

/**
 * The configuration in effect *right now* — the innermost active `wrap`
 * frame, or this instance's own when there is none. Distinct from
 * `ConstructionContext` (`Fabricator/Types.ts`), which is one
 * construction's internal dispatch plumbing; this is the caller-facing
 * "what configuration is in effect."
 */
export type Context = {
  readonly seed: ReadonlyArray<string>;
  readonly algorithm: Algorithm;
  readonly attribution: Attribution;
  readonly clock: number;
};

/**
 * A single initialized library instance: the registry it was given, and
 * a `construct()` bound to its own isolated randomness — its own seed,
 * builder, and per-file overrides/streams, held internally and never
 * shared with any other `initialize()` call. Independently initialized
 * instances (e.g. parallel tests) can never perturb each other.
 */
export interface Instance<$Registry extends PlainObject> extends Pick<
  RandomSource,
  "seed"
> {
  /** The registry of type definers this instance was initialized with. */
  readonly T: $Registry;

  /**
   * Turn a Schema built from `T` into a live Fabricator, deriving fresh
   * randomness from this instance's own seed for whichever leaves
   * actually need it.
   */
  Fabricator: Constructor;

  /**
   * Every combination of every enumerable node in `schema` — every enum
   * member, both sides of an optional field, and so on — as a cartesian
   * product, lazily. Throws eagerly, before producing anything, if the
   * count exceeds `limits.combinatorial` (see `initialize`'s config).
   */
  combinatorial: Enumerable;

  /**
   * The minimum set of instances such that every option of every
   * enumerable node in `schema` appears at least once — count equal to
   * the *widest* single axis, not the product, with narrower axes
   * cycling to fill it. Unbounded: its count can never exceed the
   * schema as written, so unlike `combinatorial` it carries no limit.
   */
  coverage: Enumerable;

  /**
   * Derive a new instance laid over this one: anything the overlay names
   * overrides, anything it omits inherits. A bare `seed` replaces this
   * instance's seed; `seed: layer(...)` appends onto it. A peer of an
   * `initialize()` return value in every respect, including its own
   * `fork`.
   */
  fork<const $ForkRegistry extends PlainObject = $Registry>(
    overlay?: Overlay<$ForkRegistry>,
  ): Instance<$ForkRegistry>;

  /**
   * `fork(overlay)`, made ambient for the synchronous extent of `block`:
   * every `new Fabricator(...)`, `combinatorial(...)`, and
   * `coverage(...)` reached inside — on this instance or any other in
   * the same lineage — resolves against the fork instead, with nothing
   * threaded through. The fork is also passed to `block`: use it
   * explicitly where that reads better, and *necessarily* for any async
   * work, which the ambient frame does not survive — a build reached
   * after an `await` inside `block` sees this instance's own
   * configuration again, not the wrap's.
   *
   * A nested `wrap` lays over whichever frame is currently active, not
   * over the instance it was called on — so `overlay.seed: layer(...)`
   * accumulates with nesting depth while a bare `seed` still replaces
   * outright, discarding every enclosing layer.
   */
  wrap<$Return, const $WrapRegistry extends PlainObject = $Registry>(
    overlay: Overlay<$WrapRegistry>,
    block: (scope: Instance<$WrapRegistry>) => $Return,
  ): $Return;

  /**
   * The configuration in effect right now: the innermost active `wrap`
   * frame's, or this instance's own outside any `wrap`. A live view, not
   * a snapshot — reflects whichever frame is active at the moment each
   * property is read, since one `Instance` outlives any number of
   * `wrap`s.
   */
  readonly context: Context;
}
