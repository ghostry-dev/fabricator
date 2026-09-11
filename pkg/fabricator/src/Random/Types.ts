import { Layer } from "../Types";

/**
 * A zero-argument function that produces a float in `[0, 1)`, exactly like
 * `Math.random()` does.
 */
export type NumberGenerator = () => number;

/**
 * A stream of randomness.
 */
export type Stream = {
  next: NumberGenerator;

  /**
   * The seed from which this stream was created.
   */
  readonly seed: string;

  /**
   * The count of times a number has been requested from this stream.
   */
  readonly iterations: number;
};

/**
 * A seedable pseudorandom number generator.
 *
 * Given an arbitrary string seed, returns a {@link NumberGenerator}.
 */
export type Algorithm = (seed: string) => NumberGenerator;

/**
 * Everything a single leaf's randomness is derived from. Encoded as a fixed
 * tuple (`Random/index.ts`'s `encode`), this _is_ the stream seed:
 * `toStream(algorithm, encode(trace)).seed === stream.seed` for every traced
 * leaf, so the derived seed is not a field of its own.
 *
 * Attached to every built Fabricator as `.trace` — recording is unconditional,
 * even for a node that never draws (a bare `object`, `always`,
 * `object.compute`). Minting a stream from it (`toStreamFromTrace`) is still
 * paid only by nodes that draw.
 *
 * Slots, in encoded order:
 *
 * - `salt` — the _instance's_ salt, normalized to its parts
 *   ({@link RandomSource.salt}), not anything derived per leaf.
 * - `clock` — this construction's resolved "now," epoch milliseconds
 *   (`Instance/Types.ts`'s `Config.clock`). Second, not after the per-leaf
 *   slots: blast radius matches `salt` — both are instance-level and perturb
 *   every leaf, unlike `path`/`kind`/`ordinal`, which narrow to one leaf. Never
 *   `undefined`: clock is always a concrete instant before any leaf dispatches
 *   (`RandomSource`'s `Options.clock`).
 * - `path` — structural position within the construction: field name, tuple slot,
 *   choice option, one segment per nesting level (`Constructor.ts`'s `make`).
 *   Distinguishes two leaves of the same kind in one construction. Stable under
 *   insert/remove/reorder of unrelated siblings — only a leaf's own position
 *   identifies it.
 * - `kind` — schema kind the node was constructed as. Redundant given a unique
 *   `path`, but changing a field's kind must change its data.
 * - `ordinal` — which construction on this source this node belongs to: the next
 *   value of the source's one counter, or a pinned value
 *   (`ConstructorOptions.ordinal`), which is how a replay avoids advancing that
 *   counter. `null` for a build that deliberately takes no ordinal — a
 *   `combinatorial`/`coverage` rebuild. `null`, not absent: a pin counts when
 *   it is defined, so only a defined "no ordinal" survives being replayed.
 */
export type Trace = {
  readonly salt: ReadonlyArray<string>;
  readonly clock: number;
  readonly path: ReadonlyArray<string>;
  readonly kind: string;
  readonly ordinal: number | null;
};

/**
 * Caller-supplied overrides for the construction-owned {@link Trace} slots
 * {@link RandomSource.toRoot} resolves. `path`/`kind` are the only slots absent:
 * they are per-node and applied in `construct()`, not here.
 *
 * `salt` is a pin like the rest — it substitutes into that trace slot and does
 * nothing else. It does not fork, so it neither resets nor sidesteps this
 * source's construction counter: a salted build takes the next ordinal exactly
 * as an unsalted one does. A caller who wants an isolated source, with its own
 * counters, forks — that is what `fork`/`wrap` are for. Already normalized to
 * parts here, since {@link Trace} carries the array form.
 *
 * Definedness, not `in`: a defined `ordinal` — a number, or `null` for "no
 * ordinal" — is taken verbatim and does not advance the counter. That is all a
 * replay needs, since every real {@link Trace} carries a defined ordinal.
 */
export type RootPins = {
  salt?: ReadonlyArray<string> | undefined;
  clock?: number | undefined;
  ordinal?: number | null | undefined;
};

/**
 * A construction's root: every {@link Trace} slot a construction fixes, before a
 * leaf supplies its own `path`/`kind`. `RandomSource.toRoot` resolves this once
 * per construction; callers spread it into a full {@link Trace} per leaf and
 * hand that to `toStreamFromTrace`. One construction-ordinal bump is reused
 * across every leaf that construction dispatches.
 */
export type ConstructionTrace = Omit<Trace, "path" | "kind">;

/**
 * What a producer is told about the fabrication it is running inside. One
 * object, not a positional list: this is the only channel a producer has, and a
 * future addition must not change every kind's `.as(...)` arity. Curated, not
 * the whole instance `Config` — a producer has no business reading `salt`, and
 * `random` already carries this leaf's own derived seed.
 */
export type ProduceContext = {
  /** This leaf's own seeded stream, keyed by its structural path. */
  random: Stream;

  /**
   * This construction's resolved "now," epoch milliseconds — the active `wrap`
   * frame's `Config.clock` if one is active, else the instance's
   * (`Instance/Types.ts`'s `Config.clock`). Defaults to an instant derived from
   * the instance's salt, not `Date.now()`, so a producer that reads it replays
   * like one that only reads `random`. A number, not a `Date`: the instant is
   * fixed once resolved, and a `Date` handed to every producer would be a
   * shared mutable — the same footgun `T.always([])` sharing one array
   * reference already warns against.
   */
  clock: number;
};

/**
 * A kind's opaque custom producer — `.as(produce)` — given a
 * {@link ProduceContext} so its output replays under a salt like every other
 * primitive's draws. A zero-argument function (`() => $T`) is still assignable,
 * so every existing `.as(() => ...)` call compiles.
 */
export type Produce<$T> = (context: ProduceContext) => $T;

/**
 * A salt as a caller supplies it: one string, or several — several lets a
 * caller compose independent parts (user id, session id, scenario label)
 * without joining them first. Always normalized internally to
 * `ReadonlyArray<string>` (`toRandomSource`'s `normalizeSalt`); a single string
 * is the one-element case.
 */
export type Salt = string | ReadonlyArray<string>;

/**
 * A {@link Salt} tagged as composing onto whatever base is in effect, rather
 * than replacing it — what `layer(salt)` (`Random/index.ts`) produces. Tagged
 * with `[Layer]` exactly as `replace()` (`Utility/Core.ts`) tags a merge
 * operand with `[Replace]`, so a caller never names the symbol and no ordinary
 * `Salt` — string or array — can be mistaken for one.
 */
export type Layered = { readonly [Layer]: Salt };

/**
 * `clock` is required, unlike `salt`/`algorithm` — by the time a `RandomSource`
 * is built, both the wall-clock default and the `"derived"` policy
 * (`Instance/Types.ts`'s `Config.clock`) have already been resolved to a
 * concrete epoch-millisecond instant (`Instance/Core.ts`'s `resolveClock`), so
 * `toRandomSource` has no default left to supply.
 */
export type Options = {
  salt?: Salt | undefined;
  algorithm?: Algorithm | undefined;
  clock: number;
};

/**
 * `new Fabricator(schema, options)`'s own option shape — not `Options`.
 * {@link Trace} is assignable to this (every slot optional here, required
 * there), which is what makes `new Fabricator(schema, trace)` a legal replay.
 *
 * Every field here pins one {@link Trace} slot, `salt` included — it is not a
 * special case, and it does not fork. A bare `salt` replaces the instance's own
 * for this build; `salt: layer(...)` (via `layer()`, `Random/index.ts`)
 * composes onto whichever base is in effect (`[...instance.salt, ...salt]`), so
 * the construction still varies when the instance is re-salted, which the bare
 * form does not. That is `fork`/`wrap`'s own `Overlay.salt` parity, one level
 * down.
 *
 * Pinning a salt says nothing about anything else. The build takes the next
 * ordinal on its source and inherits the instance's clock, exactly as an
 * unsalted build does — so it shifts, and is shifted by, neighbouring
 * constructions like any other. Two same-salt builds therefore diverge.
 *
 * `clock` / `ordinal` pin the construction-owned {@link Trace} slots
 * {@link RandomSource.toRoot} would otherwise resolve. Definedness, not `in`: a
 * given `ordinal` — a number, or `null` for "no ordinal" — is taken verbatim
 * with no counter bump, which is all a replay needs; without it, the
 * construction takes the source counter's next value. A salted construction is
 * not, by default, asking for a different "now"; a replayed trace whose `clock`
 * is present explicitly is.
 *
 * `path` is the base structural path `make` extends for descendants, so
 * replaying a nested node's trace reproduces its subtree at the positions it
 * originally occupied. `kind`, when a string, must match `schema`'s own
 * `[Kind]` or `construct()` throws `TraceKindMismatchError`.
 *
 * No per-build algorithm override: unlike `salt`, the algorithm is not a trace
 * slot. Only `initialize({ salt, algorithm })` — instance-wide, via `Options` —
 * sets it.
 */
export type ConstructorOptions = {
  salt?: Salt | Layered | undefined;
  clock?: number | undefined;
  path?: ReadonlyArray<string> | undefined;
  kind?: string | undefined;
  ordinal?: number | null | undefined;
};

/**
 * An isolated source of randomness: everything a single `initialize()` instance
 * needs to derive private, reproducible seeds for the fabricators it builds.
 * Each instance owns its own salt, builder, and per-construction counters —
 * nothing here is shared module-level state, so independently initialized
 * instances (e.g. parallel tests) can never perturb each other.
 */
export type RandomSource = {
  /**
   * Resolve one construction's root: this source's own `salt`/`clock` and the
   * next construction ordinal, each overridable by {@link RootPins}. Called once
   * per `new Fabricator(...)` (or per lazy expansion of a `T.recursive` schema,
   * each of which resolves its own root on a private forked source), never per
   * leaf: the returned {@link ConstructionTrace} is what every leaf beneath it
   * completes into a full {@link Trace} and hands to `toStreamFromTrace`. One
   * construction-ordinal bump serves the whole construction.
   */
  toRoot(pins?: RootPins): ConstructionTrace;

  /**
   * The algorithm this source (and every fork of it) hashes with. Stream
   * derivation is _not_ a member: it depends on no per-source state, so it is
   * the free function `toStreamFromTrace(algorithm, trace)`. `toRoot` is the
   * only stateful member (the construction counter).
   */
  readonly algorithm: Algorithm;

  /**
   * The salt this instance currently derives every stream from, normalized to
   * its parts — a single string becomes a one-element array. Always an array so
   * a caller reading it back (e.g. `initialize({ salt: instance.salt })`)
   * round-trips through the same `Salt`-accepting surface it came from.
   */
  readonly salt: ReadonlyArray<string>;

  /**
   * Create a new, fully isolated `RandomSource` — its own private construction
   * counters, sharing only the algorithm — salted independently from this one.
   * For a build whose randomness must stay entirely self-contained
   * (`T.recursive`, whose expansion count is data-dependent, unlike every other
   * kind's fixed, schema-determined dispatch count; and `coverage`'s
   * permutation stream): forking means its internal draws can never perturb, or
   * be perturbed by, anything else built from the same `initialize()` instance,
   * no matter how many times or how deeply it expands.
   */
  fork(salt: Salt): RandomSource;
};
