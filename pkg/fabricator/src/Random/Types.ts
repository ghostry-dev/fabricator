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
 * - `seed` — the _instance's_ seed, normalized to its parts
 *   ({@link RandomSource.seed}), not anything derived per leaf.
 * - `clock` — this construction's resolved "now," epoch milliseconds
 *   (`Instance/Types.ts`'s `Config.clock`). Second, not after the per-leaf
 *   slots: blast radius matches `seed` — both are instance-level and perturb
 *   every leaf, unlike `file`/`path`/`kind`/`ordinal`, which narrow to one
 *   leaf. Never `undefined` (unlike `file`/`ordinal`): clock is always a
 *   concrete instant before any leaf dispatches (`RandomSource`'s
 *   `Options.clock`).
 * - `root` — how `file` and `ordinal` were resolved ({@link RootKind}). Sits
 *   immediately before `file` because that is what it explains. Distinguishes
 *   the three situations that all produce `file: undefined` (`{ kind: "none" }`
 *   attributed, an unattributed seeded construction, a counted recursive
 *   expansion), so a captured trace can be replayed faithfully via `new
 *   Fabricator(schema, trace)`.
 * - `file` — the file this node's _construction_ (not the node) was attributed
 *   to, relative to the instance's {@link Attribution} root (absolute only if
 *   outside that root). `undefined` under `"counted"` / `"unattributed"`, or
 *   `"attributed"` with `{ kind: "none" }` — {@link RootKind} says which.
 * - `path` — structural position within the construction: field name, tuple slot,
 *   choice option, one segment per nesting level (`Constructor.ts`'s `make`).
 *   Distinguishes two leaves of the same kind in one construction. Stable under
 *   insert/remove/reorder of unrelated siblings — only a leaf's own position
 *   identifies it.
 * - `kind` — schema kind the node was constructed as. Redundant given a unique
 *   `path`, but changing a field's kind must change its data.
 * - `ordinal` — which construction among those sharing this `file` this node
 *   belongs to. `undefined` for `"unattributed"`, already unique by its forked
 *   seed.
 */
export type Trace = {
  readonly seed: ReadonlyArray<string>;
  readonly clock: number;
  readonly root: RootKind;
  readonly file: string | undefined;
  readonly path: ReadonlyArray<string>;
  readonly kind: string;
  readonly ordinal: number | undefined;
};

/**
 * Caller-supplied overrides for the construction-owned {@link Trace} slots
 * {@link RandomSource.toRoot} resolves. `seed` is not among them: it is the
 * {@link RandomSource}'s own identity (forked via {@link ConstructorOptions.seed}
 * when replaying), not something `toRoot` substitutes. `path`/`kind` are
 * per-node and applied in `construct()`, not here.
 *
 * Definedness, not `in`: `root` is present exactly when a trace is being
 * replayed and is never `undefined` on a real {@link Trace}.
 */
export type RootPins = {
  clock?: number | undefined;
  root?: RootKind | undefined;
  file?: string | undefined;
  ordinal?: number | undefined;
};

/**
 * A construction's root: every {@link Trace} slot a {@link RootKind} resolution
 * fixes, before a leaf supplies its own `path`/`kind`. `RandomSource.toRoot`
 * resolves this once per construction; callers spread it into a full
 * {@link Trace} per leaf and hand that to `toStreamFromTrace`. One stack walk,
 * one construction-ordinal bump — reused across every leaf that construction
 * dispatches.
 */
export type ConstructionTrace = Omit<Trace, "path" | "kind">;

/**
 * What a producer is told about the fabrication it is running inside. One
 * object, not a positional list: this is the only channel a producer has, and a
 * future addition must not change every kind's `.as(...)` arity. Curated, not
 * the whole instance `Config` — a producer has no business reading `seed` or
 * `attribution`, and `random` already carries this leaf's own derived seed.
 */
export type ProduceContext = {
  /** This leaf's own seeded stream, keyed by its structural path. */
  random: Stream;

  /**
   * This construction's resolved "now," epoch milliseconds — the active `wrap`
   * frame's `Config.clock` if one is active, else the instance's
   * (`Instance/Types.ts`'s `Config.clock`). Defaults to an instant derived from
   * the instance's seed, not `Date.now()`, so a producer that reads it replays
   * like one that only reads `random`. A number, not a `Date`: the instant is
   * fixed once resolved, and a `Date` handed to every producer would be a
   * shared mutable — the same footgun `T.always([])` sharing one array
   * reference already warns against.
   */
  clock: number;
};

/**
 * A kind's opaque custom producer — `.as(produce)` — given a
 * {@link ProduceContext} so its output replays under a seed like every other
 * primitive's draws. A zero-argument function (`() => $T`) is still assignable,
 * so every existing `.as(() => ...)` call compiles.
 */
export type Produce<$T> = (context: ProduceContext) => $T;

/**
 * How one _construction_ (a single `new Fabricator(...)` call) is rooted,
 * before any of its leaves are dispatched — resolved once, not per leaf, at
 * `Constructor.ts`'s `construct()`. Every leaf then derives its stream from
 * this root plus its own structural path, so inserting or reordering a sibling
 * field can never shift another field onto a different stream.
 *
 * Each variant is a decision about the two {@link Trace} slots a construction
 * owns — `file` and `ordinal` — and nothing else:
 *
 * | variant          | `file`                  | `ordinal`              |
 * | ---------------- | ----------------------- | ---------------------- |
 * | `"attributed"`   | resolved from the stack | next ordinal for it    |
 * | `"counted"`      | `undefined`             | next file-less ordinal |
 * | `"unattributed"` | `undefined`             | `undefined`            |
 *
 * `"attributed"` walks the live call stack once (`resolveCallerFile()`) and
 * relativizes it under the instance's `Attribution` root — or, under `{ kind:
 * "none" }`, resolves no file — then assigns the next ordinal for that file.
 * Two constructions in the same file diverge by default; a lone construction
 * stays reproducible across however many times its file is imported or re-run.
 * `ConstructorOptions.file` without `root` pins that file and draws the next
 * ordinal for it (the wrapping- integration case). A replay (`pins.root` given)
 * takes `file` and `ordinal` verbatim, including `undefined`.
 * `test/fixtures/checkout-a`/`checkout-b` stand in for two checkouts using real
 * frames instead.
 *
 * `"counted"` indexes without attributing. Under `{ kind: "none" }` an
 * `"attributed"` scope resolves to precisely this, and the two share the one
 * file-less bucket — reachable only if both kinds of scope were opened on a
 * single source, which nothing does. `"counted"` is not a variant you choose
 * when building — it is recorded on a node's {@link Trace} (and replayed) for
 * expansions inside `T.recursive`, whose private fork uses it so each lazy
 * expansion gets an ordinal (see `recursive/Fabricator.ts`). An identity that
 * isn't a stack frame but should still vary with the instance's seed is
 * `ConstructorOptions.seed`'s layered form (`{@link Layered}`, via
 * `layer(...)`) — see `ConstructorOptions`.
 *
 * `"unattributed"` fixes neither slot — used only by a source already isolated
 * for one construction (an explicitly seeded `new Fabricator(schema, { seed
 * })`, which forks a new `RandomSource` for that one build). A layered seed
 * (`{@link Layered}`, via `layer(...)`) still opens this same scope: composing
 * onto a base seed is a statement about _what_ the fork's seed is, not how the
 * fork itself should be rooted.
 *
 * A plain string union, not a discriminant object: none of the three variants
 * carries data of its own. Caller-supplied overrides go through
 * {@link RootPins} on {@link RandomSource.toRoot}, not through this union. A `{
 * kind: RootKind }` wrapper would invite a field an object shape can carry and
 * a switch can silently ignore.
 */
export type RootKind = "attributed" | "counted" | "unattributed";

/**
 * A seed as a caller supplies it: one string, or several — several lets a
 * caller compose independent parts (user id, session id, scenario label)
 * without joining them first. Always normalized internally to
 * `ReadonlyArray<string>` (`toRandomSource`'s `normalizeSeed`); a single string
 * is the one-element case.
 */
export type Seed = string | ReadonlyArray<string>;

/**
 * A {@link Seed} tagged as composing onto whatever base is in effect, rather
 * than replacing it — what `layer(seed)` (`Random/index.ts`) produces. Tagged
 * with `[Layer]` exactly as `replace()` (`Utility/Core.ts`) tags a merge
 * operand with `[Replace]`, so a caller never names the symbol and no ordinary
 * `Seed` — string or array — can be mistaken for one.
 */
export type Layered = { readonly [Layer]: Seed };

/**
 * How an instance normalizes a construction's resolved file before it becomes
 * part of that construction's root — set once via `initialize({ attribution
 * })`.
 *
 * `"rooted"` expresses every file relative to `root`, so a checkout at a
 * different absolute path on a different machine derives the same seeds. `root`
 * accepts an absolute path or a `file://` URL (e.g. `new URL("..",
 * import.meta.url).href`, which needs no `node:path`), and is a normalization
 * parameter only — it never enters the hashed material, so moving the root
 * without moving the files under it changes nothing. A file outside `root` is
 * expressed with a leading `..` run rather than left absolute, so it stays
 * stable too, as long as both locations move together under the same checkout
 * (see `relativize`, `Random/CallSite.ts`).
 *
 * `"call site"`, the default, is `"rooted"` at the directory of whichever file
 * called `initialize()` — resolved once, at that call, from the live stack. Two
 * `initialize()` calls in different files that share a seed and happen to
 * produce the same file's-worth of relative paths (a symmetric monorepo layout
 * — this repo's `pkg/fabricator` and `pkg/fabricator-adapter-typebox-v0` test
 * suites) will collide; use `"rooted"` at a shared repository root instead.
 *
 * `"none"` attributes nothing: every construction in the instance draws its
 * root from one shared, file-less counter. Maximally portable — no path can
 * influence a seed — at the cost of every construction sharing one counter, so
 * adding, removing, or reordering a _construction_ anywhere in the instance
 * shifts every later one. Individual fields within one construction are
 * unaffected: they're keyed by structural path, not dispatch order.
 */
export type Attribution =
  | { kind: "rooted"; root: string }
  | { kind: "call site" }
  | { kind: "none" };

/**
 * {@link Attribution} after `"call site"` has been resolved against the live
 * stack and `root` normalized — what actually drives construction-root
 * resolution. This, not the caller-facing `Attribution`, is what
 * `RandomSource.fork` threads through: re-resolving `"call site"` inside a fork
 * would read the stack at whatever moment the fork happens to run (an
 * explicitly seeded build, an enumeration's rebuild) and root the child
 * somewhere unrelated to the instance that spawned it.
 */
export type ResolvedAttribution =
  | { kind: "rooted"; root: string }
  | { kind: "none" };

/**
 * `clock` is required, unlike `seed`/`algorithm`/`attribution` — by the time a
 * `RandomSource` is built, both the wall-clock default and the `"seeded"`
 * policy (`Instance/Types.ts`'s `Config.clock`) have already been resolved to a
 * concrete epoch-millisecond instant (`Instance/Core.ts`'s `resolveClock`), so
 * `toRandomSource` has no default left to supply.
 */
export type Options = {
  seed?: Seed | undefined;
  algorithm?: Algorithm | undefined;
  attribution?: Attribution | undefined;
  clock: number;
};

/**
 * `new Fabricator(schema, options)`'s own option shape — not `Options`.
 * {@link Trace} is assignable to this (every slot optional here, required
 * there, and `file`/`ordinal` are `T | undefined` on both so `{ ...trace }`
 * typechecks under `exactOptionalPropertyTypes`), which is what makes `new
 * Fabricator(schema, trace)` a legal replay.
 *
 * A bare `seed` is a statement about _attribution_: it forks an isolated
 * `RandomSource` from exactly that value, sidestepping both the default
 * call-site logic and the instance's own seed. The same seed reproduces the
 * same result regardless of which file it's constructed from, which instance
 * built it, or how that instance was itself seeded — useful for a fixture that
 * should never change no matter how the surrounding run is reseeded.
 *
 * `seed: layer(...)` (via `layer()`, `Random/index.ts`) is the same fork, but
 * composed onto the instance's own seed (`[...instance.seed, ...seed]`) instead
 * of replacing it — the construction still varies when the instance is
 * reseeded, which the bare form does not (see {@link RootKind}'s `"counted"`
 * paragraph). This is `fork`/`wrap`'s own `Overlay.seed` mechanism one level
 * down: the instance itself is the base, so no separate instance is needed just
 * to pin an identity that should still track the instance's seed.
 *
 * `clock` / `root` / `file` / `ordinal` pin the construction-owned
 * {@link Trace} slots {@link RandomSource.toRoot} would otherwise resolve.
 * Definedness, not `in`: `root` given means this is a replay (`file` and
 * `ordinal` taken verbatim, `undefined` included, no stack walk and no counter
 * bump). `root` absent but `file` given pins that file and draws `ordinal` from
 * _that file's_ counter — the wrapping-integration case. Neither given resolves
 * as an ordinary construction. A seeded construction is not, by default, asking
 * for a different "now"; a replayed trace whose `clock` is present explicitly
 * is.
 *
 * `path` is the base structural path `make` extends for descendants, so
 * replaying a nested node's trace reproduces its subtree at the positions it
 * originally occupied. `kind`, when a string, must match `schema`'s own
 * `[Kind]` or `construct()` throws `TraceKindMismatchError`.
 *
 * No per-build algorithm override: it complicates root resolution for a
 * capability nobody asked for, unlike `seed`, which is a real statement about
 * attribution. Only `initialize({ seed, algorithm })` — instance-wide, via
 * `Options` — sets the algorithm.
 */
export type ConstructorOptions = {
  seed?: Seed | Layered | undefined;
  clock?: number | undefined;
  root?: RootKind | undefined;
  file?: string | undefined;
  path?: ReadonlyArray<string> | undefined;
  kind?: string | undefined;
  ordinal?: number | undefined;
};

/**
 * An isolated source of randomness: everything a single `initialize()` instance
 * needs to derive private, reproducible seeds for the fabricators it builds.
 * Each instance owns its own seed, builder, and per-construction counters —
 * nothing here is shared module-level state, so independently initialized
 * instances (e.g. parallel tests) can never perturb each other.
 */
export type RandomSource = {
  /**
   * Resolve one construction's root — see {@link RootKind}. Called once per `new
   * Fabricator(...)` (or per lazy expansion of a `T.recursive` schema, each of
   * which resolves its own root on a private forked source), never per leaf:
   * the returned {@link ConstructionTrace} is what every leaf beneath it
   * completes into a full {@link Trace} and hands to `toStreamFromTrace`. One
   * stack walk and construction-ordinal bump serves the whole construction.
   */
  toRoot(kind: RootKind, pins?: RootPins): ConstructionTrace;

  /**
   * The algorithm this source (and every fork of it) hashes with. Stream
   * derivation is _not_ a member: it depends on no per-source state, so it is
   * the free function `toStreamFromTrace(algorithm, trace)`. `toRoot` is the
   * only stateful member (per-file ordinal counters).
   */
  readonly algorithm: Algorithm;

  /**
   * The seed this instance currently derives every stream from, normalized to
   * its parts — a single string becomes a one-element array. Always an array so
   * a caller reading it back (e.g. `initialize({ seed: instance.seed })`)
   * round-trips through the same `Seed`-accepting surface it came from.
   */
  readonly seed: ReadonlyArray<string>;

  /**
   * Create a new, fully isolated `RandomSource` — its own private per-file
   * construction counters, sharing only the algorithm — seeded independently
   * from this one. For a build whose randomness must stay entirely
   * self-contained (an explicitly seeded `new Fabricator(schema, { seed })`, or
   * `T.recursive`, whose expansion count is data-dependent, unlike every other
   * kind's fixed, schema-determined dispatch count): forking means its internal
   * draws can never perturb, or be perturbed by, anything else built from the
   * same `initialize()` instance, no matter how many times or how deeply it
   * expands.
   */
  fork(seed: Seed): RandomSource;
};
