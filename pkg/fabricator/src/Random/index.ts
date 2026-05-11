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
  Seed,
  Stream,
  Trace,
} from "./Types";

/**
 * Build the library's built-in PRNG from a seed. The same seed always
 * yields the same stream. Seeds may be numbers or strings; both are
 * stringified and hashed to fully seed sfc32's state.
 */
export function defaultAlgorithm(seed: string): NumberGenerator {
  return sfc32(...cyrb128(seed));
}

/**
 * Mint a fresh seed value — a uint32 label. Not used as
 * `initialize()`'s default (an omitted seed is empty; wall-clock
 * `clock` is the default entropy); kept for callers that want a
 * generated mixer, and for tests that need one.
 */
export function randomSeed(): string {
  return ((Math.random() * 0x1_0000_0000) >>> 0).toString(10);
}

/**
 * Derive the explicit `"seeded"` clock — an epoch-millisecond instant,
 * drawn across the full representable `Date` span — from an instance's
 * own `algorithm`/`seed`. The unconfigured default is wall-clock time
 * (`Instance/Core.ts`'s `overlay`); this is the opt-in that makes
 * `seed` alone the reproducibility unit, at the cost of an implausible
 * "now". A throwaway two-element encoding
 * (`JSON.stringify([seed, "clock"])`), *not* routed through
 * `RandomSource`/`Trace`: after the clock is folded into stream
 * derivation, a forked source's own stream derivation requires a clock,
 * so deriving the clock from a fork would be circular. Kept below that
 * layer, which also keeps this collision-free with every leaf's
 * `encode(trace)` — that encoding is always seven elements, this is
 * always two, and the two can never produce the same JSON array.
 * `Math.trunc`ed because a `Date`'s precision is whole milliseconds.
 */
export function deriveClock(
  algorithm: Algorithm,
  seed: ReadonlyArray<string>,
): number {
  const stream = toStream(algorithm, JSON.stringify([seed, "clock"]));
  return Math.trunc((stream.next() * 2 - 1) * MAX_TIME);
}

/**
 * Optional mixer from the environment when `initialize()` was given no
 * `seed`. Never a generated value: an omitted seed with none of these
 * set is empty, and wall-clock `clock` is the run's entropy.
 * `FABRICATOR_SEED` takes priority as this library's own override,
 * then the conventional `SEED`/`RANDOM_SEED` names.
 */
function envSeed(): string | undefined {
  const env = typeof process === "object" ? process.env : undefined;

  return env?.["FABRICATOR_SEED"] ?? env?.["SEED"] ?? env?.["RANDOM_SEED"];
}

/**
 * Collapse a {@link Trace} into one string to hash — and, since
 * `toStreamFromTrace` hashes exactly this output, the *definition* of
 * that leaf's stream seed. Concatenating fields with a delimiter would
 * collide when a path/kind/seed part contains that delimiter
 * (`file="a b", kind="c"` vs `file="a", kind="b c"`) — silently: two
 * leaves that should draw independently would share one stream.
 * `JSON.stringify` as an array makes every field's and slot's
 * boundaries unambiguous regardless of content or nesting depth.
 * `undefined` (`file`, `ordinal`) is the right "this slot doesn't
 * apply" rather than a sentinel string: `JSON.stringify` writes it as
 * `null` in an array position, one unambiguous value, with no chance
 * of colliding with a real file path or index.
 */
export function encode(trace: Trace): string {
  return JSON.stringify([
    trace.seed,
    trace.clock,
    trace.root,
    trace.file,
    trace.path,
    trace.kind,
    trace.ordinal,
  ]);
}

/**
 * Normalize a caller-supplied {@link Seed} to its parts: a single string
 * becomes a one-element array, an array passes through unchanged, and a
 * missing seed is empty — unless {@link envSeed} supplies one. No
 * generated fallback: an omitted seed is not a second source of
 * entropy beside the instance clock.
 */
export function normalizeSeed(seed: Seed | undefined): ReadonlyArray<string> {
  if (typeof seed === "undefined") {
    const fromEnv = envSeed();
    return typeof fromEnv === "undefined" ? [] : [fromEnv];
  }
  return typeof seed === "string" ? [seed] : [...seed];
}

/**
 * Tag a seed as composing onto whatever base is in effect, rather than
 * replacing it — the reading a bare `seed` has everywhere else in this
 * library. Mirrors `replace()`'s `[Replace]` tagging: the `[Layer]`
 * directive is read (and, at every level that accepts one, consumed) by
 * whoever resolves the seed against its base, so a caller never names
 * the symbol.
 */
export function layer(seed: Seed): Layered {
  return { [Layer]: seed };
}

export function isLayered(value: unknown): value is Layered {
  return typeof value === "object" && value !== null && Layer in value;
}

/**
 * Collapse a caller-facing {@link Attribution} to the
 * {@link ResolvedAttribution} the stream machinery uses. `"call site"`
 * must resolve *here*, and only here: `resolveCallerFile()` reads the
 * live stack, and `toRandomSource` runs synchronously inside
 * `initialize()`, so this is the one moment the first external frame
 * genuinely is the file that called `initialize()`. Resolving lazily —
 * on first construction, or again inside `fork` — would capture
 * whichever file happened to call `new Fabricator(...)`, or whichever
 * internal mechanism happened to trigger a fork.
 *
 * A directory, not the file itself, becomes the root: rooting at the
 * file would relativize that one file to `""` while every sibling still
 * carried a full relative path from a directory one level up, an
 * arbitrary asymmetry with no reason to prefer it.
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
       * Only a caller-supplied root is validated. `"call site"`'s root
       * is derived from a real stack frame's directory, which is
       * absolute by construction on every path `resolveCallerFile()`
       * can take (including its own raw-stack fallback, itself never
       * relativizable — see `CallSite.ts`), so there is nothing a
       * caller could get wrong here.
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
       * (`firstExternalFrame`, `CallSite.ts`), so `directoryOf` alone
       * is enough.
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
 * composition that *defines* a leaf's stream seed — the invariant
 * `toStream(algorithm, encode(trace)).seed === stream.seed`. Not a
 * {@link RandomSource} member: derivation depends on no per-source
 * state (a fork shares only the algorithm), so it is a free function
 * of `(algorithm, trace)`. `toRoot` is the only stateful member.
 *
 * {@link deriveClock} cannot route through this: a {@link Trace}
 * carries `clock`, and `deriveClock` is what produces it. That
 * circularity is why `deriveClock` stays below the
 * `RandomSource`/`Trace` layer, with a two-element encoding that can
 * never collide with `encode`'s seven.
 */
export function toStreamFromTrace(algorithm: Algorithm, trace: Trace): Stream {
  return toStream(algorithm, encode(trace));
}

/**
 * Create a fresh, self-contained {@link RandomSource} — the randomness
 * state a single `initialize()` instance owns for its lifetime.
 * `options.clock` is baked in here, once, as a plain number — the
 * `"seeded"` policy is already resolved by the caller
 * (`Instance/Core.ts`'s `resolveClock`) before a source is ever built,
 * so every root this source resolves carries the identical instant, and
 * `fork` threads it forward unchanged.
 */
export function toRandomSource(options: Options): RandomSource {
  let seed: ReadonlyArray<string> = normalizeSeed(options.seed);
  let algorithm: Algorithm = options.algorithm ?? defaultAlgorithm;
  let attribution: ResolvedAttribution = resolveAttribution(
    options.attribution,
  );
  const clock: number = options.clock;

  /**
   * Per-file construction counters, lazily derived. Every `"attributed"`
   * construction draws the next ordinal for its own resolved file (or,
   * under `{ kind: "none" }`, the shared `undefined` bucket every
   * construction falls into) — never a shared counter spanning kinds or
   * leaves within a construction, since leaves are already distinguished
   * by structural path. Two constructions in the same file diverge by
   * default; any single construction's leaves stay stable under
   * insertion/reordering.
   */
  let constructionOrdinals = new Map<string | undefined, number>();

  function nextConstructionOrdinal(file: string | undefined): number {
    const ordinal = constructionOrdinals.get(file) ?? 0;
    constructionOrdinals.set(file, ordinal + 1);
    return ordinal;
  }

  /**
   * Resolve one construction's root — the {@link ConstructionTrace} every
   * node beneath it will complete into its own {@link Trace} — see
   * {@link RootKind} for what each variant means. `clock` rides along
   * unchanged unless `pins.clock` supplies one: it is this source's own
   * fixed instant, not something a `RootKind` resolves, except a replay
   * which pins the original construction's "now".
   *
   * File resolves first and ordinal second. `pins.root` present means
   * this is a replay: `file` and `ordinal` are taken verbatim
   * (`undefined` included), and the construction-ordinal counter is
   * not bumped. `pins.file` without `pins.root` pins that file and
   * draws the next ordinal for it.
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

    return { seed, clock: pins.clock ?? clock, root, file, ordinal };
  }

  function resolveRootFile(kind: RootKind): string | undefined {
    if (kind !== "attributed") return undefined;
    /**
     * A mode whose entire point is not caring about files shouldn't
     * pay for a stack capture it's about to discard — so this
     * short-circuits *before* `resolveCallerFile()` runs, the only
     * place in this function (and only on the `"attributed"`
     * branch) that does.
     */
    if (attribution.kind === "none") return undefined;
    return relativize(attribution.root, resolveCallerFile());
  }

  /**
   * Reuses this same factory, closing over the same `algorithm` — the
   * new source's construction-ordinal map is a fresh, empty one
   * (declared above, private to each `toRandomSource` call), so nothing
   * here is shared with the parent. Passes the already-*resolved*
   * `attribution`, not the caller-facing form that produced it:
   * re-resolving `"call site"` here would read the live stack at
   * whatever moment the fork actually runs (an explicitly seeded build,
   * a recursive schema's lazy expansion, an enumeration rebuild) and
   * root the child source somewhere unrelated to the instance that
   * spawned it. `T.recursive`'s private source and
   * `new Fabricator(schema, { seed })`'s own fork both inherit the
   * instance's attribution policy for free, with no new parameter on
   * `RandomSource`. `clock` is threaded through unchanged for the same
   * reason: a fork is a statement about seed identity, not about "now,"
   * so `T.recursive`'s private source and an explicitly seeded build
   * both resolve "now" exactly as their parent does (see
   * `Fabricator/Constructor.ts`'s `toConstructionContext`, which reads
   * a construction's clock straight off its resolved root rather than
   * threading a separate value).
   */
  function fork(childSeed: Seed): RandomSource {
    return toRandomSource({ seed: childSeed, algorithm, attribution, clock });
  }

  return { toRoot, algorithm, seed, fork };
}
