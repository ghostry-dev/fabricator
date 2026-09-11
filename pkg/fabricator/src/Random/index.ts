import { Layer, MAX_TIME } from "../Types";
import { cyrb128 } from "../Utility/Digest";
import { sfc32 } from "./Generator/sfc32";
import type {
  Algorithm,
  ConstructionTrace,
  Layered,
  NumberGenerator,
  Options,
  RandomSource,
  RootPins,
  Salt,
  Stream,
  Trace,
} from "./Types";

/**
 * Build the library's built-in PRNG from a seed — the genuine article, not a
 * caller-supplied {@link Salt}: by the time anything reaches here the salt is
 * one slot of an `encode`d {@link Trace}, and this string is that whole
 * encoding. The same seed always yields the same stream, and `cyrb128` hashes
 * it to fully seed sfc32's 128 bits of state.
 */
export function defaultAlgorithm(seed: string): NumberGenerator {
  return sfc32(...cyrb128(seed));
}

/**
 * Mint a fresh salt value — a uint32 label. Not used as `initialize()`'s
 * default (an omitted salt is empty; wall-clock `clock` is the default
 * entropy); kept for callers that want a generated mixer, and for tests that
 * need one.
 */
export function randomSalt(): string {
  return ((Math.random() * 0x1_0000_0000) >>> 0).toString(10);
}

/**
 * Derive the explicit `"derived"` clock — an epoch-millisecond instant, drawn
 * across the full representable `Date` span — from an instance's own
 * `algorithm`/`salt`. The unconfigured default is wall-clock time
 * (`Instance/Core.ts`'s `overlay`); this is the opt-in that makes `salt` alone
 * the reproducibility unit, at the cost of an implausible "now". A throwaway
 * two-element encoding (`JSON.stringify([salt, "clock"])`), _not_ routed
 * through `RandomSource`/`Trace`: after the clock is folded into stream
 * derivation, a forked source's own stream derivation requires a clock, so
 * deriving the clock from a fork would be circular. Kept below that layer,
 * which also keeps this collision-free with every leaf's `encode(trace)` — that
 * encoding is always five elements, this is always two, and the two can never
 * produce the same JSON array. `Math.trunc`ed because a `Date`'s precision is
 * whole milliseconds.
 */
export function deriveClock(
  algorithm: Algorithm,
  salt: ReadonlyArray<string>,
): number {
  const stream = toStream(algorithm, JSON.stringify([salt, "clock"]));
  return Math.trunc((stream.next() * 2 - 1) * MAX_TIME);
}

/**
 * Optional salt from the environment when `initialize()` was given no `salt`.
 * Never a generated value: an omitted salt with this unset is empty, and
 * wall-clock `clock` is the run's entropy.
 *
 * One variable, and a namespaced one. The conventional `SEED`/`RANDOM_SEED`
 * names are deliberately _not_ read: whoever sets those is asking for a stable
 * run, and a salt alone cannot deliver one — `clock` still varies per process,
 * so the run would move anyway. Honoring them would answer that request with
 * something that looks like it worked and didn't. Pinning the salt is a
 * decision about _this_ library, so it takes this library's own name, and the
 * docs can state the `clock` caveat next to it.
 */
function envSalt(): string | undefined {
  const env = typeof process === "object" ? process.env : undefined;

  return env?.["FABRICATOR_SALT"];
}

/**
 * Collapse a {@link Trace} into one string to hash — and, since
 * `toStreamFromTrace` hashes exactly this output, the _definition_ of that
 * leaf's stream seed. Concatenating fields with a delimiter would collide when
 * a path/kind/salt part contains that delimiter — silently: two leaves that
 * should draw independently would share one stream. `JSON.stringify` as an
 * array makes every field's and slot's boundaries unambiguous regardless of
 * content or nesting depth.
 */
export function encode(trace: Trace): string {
  return JSON.stringify([
    trace.salt,
    trace.clock,
    trace.path,
    trace.kind,
    trace.ordinal,
  ]);
}

/**
 * Normalize a caller-supplied {@link Salt} to its parts: a single string becomes
 * a one-element array, an array passes through unchanged, and a missing salt is
 * empty — unless {@link envSalt} supplies one. No generated fallback: an omitted
 * salt is not a second source of entropy beside the instance clock.
 */
export function normalizeSalt(salt: Salt | undefined): ReadonlyArray<string> {
  if (typeof salt === "undefined") {
    const fromEnv = envSalt();
    return typeof fromEnv === "undefined" ? [] : [fromEnv];
  }
  return typeof salt === "string" ? [salt] : [...salt];
}

/**
 * Tag a salt as composing onto whatever base is in effect, rather than
 * replacing it — the reading a bare `salt` has everywhere else in this library.
 * Mirrors `replace()`'s `[Replace]` tagging: the `[Layer]` directive is read
 * (and, at every level that accepts one, consumed) by whoever resolves the salt
 * against its base, so a caller never names the symbol.
 */
export function layer(salt: Salt): Layered {
  return { [Layer]: salt };
}

export function isLayered(value: unknown): value is Layered {
  return typeof value === "object" && value !== null && Layer in value;
}

export function toStream(algorithm: Algorithm, seed: string): Stream {
  const generator = algorithm(seed);

  let iterations = 0;

  return {
    seed,
    get iterations() {
      return iterations;
    },
    next: () => {
      iterations++;
      return generator();
    },
  };
}

/**
 * A leaf's stream: `toStream(algorithm, encode(trace))`. This is the
 * composition that _defines_ a leaf's stream seed — the invariant
 * `toStream(algorithm, encode(trace)).seed === stream.seed`. Not a
 * {@link RandomSource} member: derivation depends on no per-source state (a
 * fork shares only the algorithm), so it is a free function of `(algorithm,
 * trace)`. `toRoot` is the only stateful member.
 *
 * {@link deriveClock} cannot route through this: a {@link Trace} carries
 * `clock`, and `deriveClock` is what produces it. That circularity is why
 * `deriveClock` stays below the `RandomSource`/`Trace` layer, with a
 * two-element encoding that can never collide with `encode`'s five.
 */
export function toStreamFromTrace(algorithm: Algorithm, trace: Trace): Stream {
  return toStream(algorithm, encode(trace));
}

/**
 * Create a fresh, self-contained {@link RandomSource} — the randomness state a
 * single `initialize()` instance owns for its lifetime. `options.clock` is
 * baked in here, once, as a plain number — the `"derived"` policy is already
 * resolved by the caller (`Instance/Core.ts`'s `resolveClock`) before a source
 * is ever built, so every root this source resolves carries the identical
 * instant, and `fork` threads it forward unchanged.
 */
export function toRandomSource(options: Options): RandomSource {
  let salt: ReadonlyArray<string> = normalizeSalt(options.salt);
  let algorithm: Algorithm = options.algorithm ?? defaultAlgorithm;
  const clock: number = options.clock;

  /**
   * One construction counter per source. Leaves within a construction are
   * already distinguished by structural path, while `fork`/`wrap` create a
   * fresh source and therefore a fresh counter.
   */
  let constructionOrdinal = 0;

  /**
   * Resolve one construction's root — the {@link ConstructionTrace} every node
   * beneath it will complete into its own {@link Trace}. `salt` and `clock` ride
   * along unchanged unless pinned: they are this source's own, except in an
   * explicitly salted build or a replay pinning the original construction's
   * "now".
   *
   * A pinned `ordinal` is taken verbatim and the construction counter is not
   * bumped — a replay, or an enumeration rebuild pinning `null`. Otherwise the
   * construction takes the counter's next value.
   *
   * `!== undefined`, never `??`: `null` is a real pin meaning "no ordinal", and
   * `??` would treat it as missing and bump the counter.
   */
  function toRoot(pins: RootPins = {}): ConstructionTrace {
    return {
      salt: pins.salt ?? salt,
      clock: pins.clock ?? clock,
      ordinal:
        pins.ordinal !== undefined ? pins.ordinal : constructionOrdinal++,
    };
  }

  /**
   * Reuses this same factory, closing over the same `algorithm` — the new
   * source's construction counter starts at zero (declared above, private to
   * each `toRandomSource` call), so nothing here is shared with the parent.
   * `clock` is threaded through unchanged: a fork is a statement about salt
   * identity, not about "now," so `T.recursive`'s private source and an
   * explicitly salted build both resolve "now" exactly as their parent does
   * (see `Fabricator/Constructor.ts`'s `toConstructionContext`, which reads a
   * construction's clock straight off its resolved root rather than threading a
   * separate value).
   */
  function fork(childSalt: Salt): RandomSource {
    return toRandomSource({ salt: childSalt, algorithm, clock });
  }

  return { toRoot, algorithm, salt, fork };
}
