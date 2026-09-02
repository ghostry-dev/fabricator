import { FabricatorError } from "../Error";
import { Layer, MAX_TIME } from "../Types";
import { inline } from "../Utility/Core";
import { cyrb128 } from "../Utility/Digest";
import {
  directoryOf,
  normalizeLocation,
  relativize,
  resolveCallerFile,
} from "./CallSite";
import { sfc32 } from "./Generator/sfc32";
import type {
  Algorithm,
  Attribution,
  ConstructionTrace,
  Layered,
  NumberGenerator,
  Options,
  RandomSource,
  ResolvedAttribution,
  RootKind,
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
 * encoding is always seven elements, this is always two, and the two can never
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
 * a path/kind/salt part contains that delimiter (`file="a b", kind="c"` vs
 * `file="a", kind="b c"`) — silently: two leaves that should draw independently
 * would share one stream. `JSON.stringify` as an array makes every field's and
 * slot's boundaries unambiguous regardless of content or nesting depth.
 * `undefined` (`file`, `ordinal`) is the right "this slot doesn't apply" rather
 * than a sentinel string: `JSON.stringify` writes it as `null` in an array
 * position, one unambiguous value, with no chance of colliding with a real file
 * path or index.
 */
export function encode(trace: Trace): string {
  return JSON.stringify([
    trace.salt,
    trace.clock,
    trace.root,
    trace.file,
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

/**
 * Collapse a caller-facing {@link Attribution} to the
 * {@link ResolvedAttribution} the stream machinery uses. `"call site"` must
 * resolve _here_, and only here: `resolveCallerFile()` reads the live stack,
 * and `toRandomSource` runs synchronously inside `initialize()`, so this is the
 * one moment the first external frame genuinely is the file that called
 * `initialize()`. Resolving lazily — on first construction, or again inside
 * `fork` — would capture whichever file happened to call `new Fabricator(...)`,
 * or whichever internal mechanism happened to trigger a fork.
 *
 * A directory, not the file itself, becomes the root: rooting at the file would
 * relativize that one file to `""` while every sibling still carried a full
 * relative path from a directory one level up, an arbitrary asymmetry with no
 * reason to prefer it.
 */
export function resolveAttribution(
  attribution: Attribution | undefined,
): ResolvedAttribution {
  const policy: Attribution = attribution ?? { kind: "call site" };

  switch (policy.kind) {
    case "none": {
      return policy;
    }
    case "rooted": {
      const root = normalizeLocation(policy.root);

      /**
       * Only a caller-supplied root is validated. `"call site"`'s root is
       * derived from a real stack frame's directory, which is absolute by
       * construction on every path `resolveCallerFile()` can take (including
       * its own raw-stack fallback, itself never relativizable — see
       * `CallSite.ts`), so there is nothing a caller could get wrong here.
       */
      if (!root.startsWith("/")) {
        throw new FabricatorError.InvalidAttributionRootError(policy.root);
      }

      return toRooted(root);
    }
    case "call site": {
      /**
       * No `normalizeLocation` here, unlike the `"rooted"` branch:
       * `resolveCallerFile()` already returns a normalized location
       * (`firstExternalFrame`, `CallSite.ts`), so `directoryOf` alone is
       * enough.
       */
      const root = directoryOf(resolveCallerFile());

      return toRooted(root);
    }
  }
}

function toRooted(root: string): { kind: "rooted"; root: string } {
  return { kind: "rooted", root: root.endsWith("/") ? root : `${root}/` };
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
 * two-element encoding that can never collide with `encode`'s seven.
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
  let attribution: ResolvedAttribution = resolveAttribution(
    options.attribution,
  );
  const clock: number = options.clock;

  /**
   * Per-file construction counters, lazily derived. Every `"attributed"`
   * construction draws the next ordinal for its own resolved file (or, under `{
   * kind: "none" }`, the shared `undefined` bucket every construction falls
   * into) — never a shared counter spanning kinds or leaves within a
   * construction, since leaves are already distinguished by structural path.
   * Two constructions in the same file diverge by default; any single
   * construction's leaves stay stable under insertion/reordering.
   */
  let constructionOrdinals = new Map<string | undefined, number>();

  function nextConstructionOrdinal(file: string | undefined): number {
    const ordinal = constructionOrdinals.get(file) ?? 0;
    constructionOrdinals.set(file, ordinal + 1);
    return ordinal;
  }

  /**
   * Resolve one construction's root — the {@link ConstructionTrace} every node
   * beneath it will complete into its own {@link Trace} — see {@link RootKind}
   * for what each variant means. `clock` rides along unchanged unless
   * `pins.clock` supplies one: it is this source's own fixed instant, not
   * something a `RootKind` resolves, except a replay which pins the original
   * construction's "now".
   *
   * File resolves first and ordinal second. `pins.root` present means this is a
   * replay: `file` and `ordinal` are taken verbatim (`undefined` included), and
   * the construction-ordinal counter is not bumped. `pins.file` without
   * `pins.root` pins that file and draws the next ordinal for it.
   */
  function toRoot(kind: RootKind, pins: RootPins = {}): ConstructionTrace {
    const replaying = pins.root !== undefined;
    const root = pins.root ?? kind;

    const file =
      replaying || pins.file !== undefined ? pins.file : resolveRootFile(kind);

    const ordinal = inline(() => {
      if (replaying || pins.ordinal !== undefined) return pins.ordinal;
      if (root === "unattributed") return undefined;
      return nextConstructionOrdinal(file);
    });

    return {
      salt: pins.salt ?? salt,
      clock: pins.clock ?? clock,
      root,
      file,
      ordinal,
    };
  }

  function resolveRootFile(kind: RootKind): string | undefined {
    if (kind !== "attributed") return undefined;
    /**
     * A mode whose entire point is not caring about files shouldn't pay for a
     * stack capture it's about to discard — so this short-circuits _before_
     * `resolveCallerFile()` runs, the only place in this function (and only on
     * the `"attributed"` branch) that does.
     */
    if (attribution.kind === "none") return undefined;
    return relativize(attribution.root, resolveCallerFile());
  }

  /**
   * Reuses this same factory, closing over the same `algorithm` — the new
   * source's construction-ordinal map is a fresh, empty one (declared above,
   * private to each `toRandomSource` call), so nothing here is shared with the
   * parent. Passes the already-_resolved_ `attribution`, not the caller-facing
   * form that produced it: re-resolving `"call site"` here would read the live
   * stack at whatever moment the fork actually runs (an explicitly salted
   * build, a recursive schema's lazy expansion, an enumeration rebuild) and
   * root the child source somewhere unrelated to the instance that spawned it.
   * `T.recursive`'s private source and `new Fabricator(schema, { salt })`'s own
   * fork both inherit the instance's attribution policy for free, with no new
   * parameter on `RandomSource`. `clock` is threaded through unchanged for the
   * same reason: a fork is a statement about salt identity, not about "now," so
   * `T.recursive`'s private source and an explicitly salted build both resolve
   * "now" exactly as their parent does (see `Fabricator/Constructor.ts`'s
   * `toConstructionContext`, which reads a construction's clock straight off
   * its resolved root rather than threading a separate value).
   */
  function fork(childSalt: Salt): RandomSource {
    return toRandomSource({ salt: childSalt, algorithm, attribution, clock });
  }

  return { toRoot, algorithm, salt, fork };
}
