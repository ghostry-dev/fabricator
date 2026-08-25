import { enumerables } from "../Enumeration/Enumerate";
import { FabricatorError } from "../Error";
import { Constructor } from "../Fabricator/Constructor";
import {
  defaultAlgorithm,
  deriveClock,
  isLayered,
  normalizeSeed,
  resolveAttribution,
  toRandomSource,
} from "../Random";
import type { RandomSource, Seed } from "../Random/Types";
import { registry } from "../Schema/Registry";
import { Layer } from "../Types";
import { inline, isThenable, noop } from "../Utility/Core";
import type { PlainObject } from "../Utility/Types";
import type { Config, Context, Instance, Overlay, Stack } from "./Types";

/**
 * `combinatorial`'s default limit — `2**10`, so it admits ten independent
 * binary axes before requiring the caller to raise it explicitly. Each
 * enumerated instance costs a full build and fabricate, so this is as much a
 * wall-clock guard as a combinatorial one.
 */
export const DEFAULT_COMBINATORIAL_LIMIT = 1024;

/**
 * Fails at `initialize()`/`fork()` time, not on first `combinatorial(...)`
 * call, so a misconfigured limit surfaces immediately rather than wherever it
 * happens to first matter.
 */
function resolveCombinatorialLimit(limit: number | undefined): number {
  if (typeof limit === "undefined") return DEFAULT_COMBINATORIAL_LIMIT;

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new FabricatorError.InvalidCombinatorialLimitError(limit);
  }

  return limit;
}

/**
 * Resolve a `Config`'s `clock` to an epoch-millisecond instant: an
 * already-resolved number passes through; the unresolved `"seeded"` policy
 * derives fresh from this exact `config`'s own `algorithm`/`seed`. Called
 * wherever the clock actually matters — `instantiate` (to hand a number onward
 * to `Constructor`/`enumerables`) and the `context.clock` getter (which must
 * resolve per read anyway, since the active `wrap` frame can change) — never
 * cached on the `Config` itself, so an explicit `"seeded"` clock re-derives
 * when the seed it composes changes (see `Config`, `Instance/Types.ts`). The
 * unconfigured default is a wall-clock number from `overlay()`, not this
 * sentinel.
 */
function resolveClock(config: Config<PlainObject>): number {
  return typeof config.clock === "number"
    ? config.clock
    : deriveClock(config.algorithm, normalizeSeed(config.seed));
}

/**
 * The single place a `Config` inherits from a base — `initialize` lays its own
 * config over an empty `{}` base (nothing to inherit, so every field falls
 * through to a hardcoded default: an empty seed, wall-clock `clock`, the
 * built-in algorithm, `resolveAttribution(undefined)`'s `"call site"`
 * resolution, the default registry, the default combinatorial limit), and
 * `fork` lays its overlay over the instance it was called on (a full,
 * already-resolved `Config`, so every field has a real value to fall back to).
 * `base` is typed `Partial<Config<PlainObject>>` rather than `Config`
 * specifically so both calls go through the same function.
 *
 * `seed` composes onto the base rather than replacing it only when tagged with
 * `layer(...)` (`{@link isLayered}`) — a bare `seed` (the ordinary meaning
 * everywhere else in this library) replaces the base's outright, and an omitted
 * `seed` inherits the base's unchanged (or, at the root, an empty mixer via
 * `normalizeSeed(undefined)`, unless an env var supplies one). Wall-clock
 * `clock` is the default entropy; `seed` is an optional mixer.
 *
 * `attribution` resolves through `resolveAttribution` at most once per call,
 * and only when it's actually needed:
 *
 * - an explicit `over.attribution` always wins (resolved fresh, so `fork({
 *   attribution: { kind: "call site" } })` roots at _that_ call);
 * - otherwise an already-resolved `base.attribution` is reused as-is — never
 *   re-resolved, which keeps a fork from silently re-rooting `"call site"` at
 *   wherever `fork()` itself happens to be called (`resolveCallerFile()` skips
 *   this library's own frames, so calling it from here still lands on the
 *   user's call site either way);
 * - only when neither is available (the root case, `base.attribution` absent)
 *   does this fall back to resolving the `"call site"` default. That also keeps
 *   `initialize({ attribution: { kind: "none" } })` — or any other explicit
 *   override — from paying for a stack walk whose result would be immediately
 *   discarded.
 *
 * `algorithm`/`types`: wholesale replacement when given, matching how
 * `initialize({ types })` already behaves — no deep merge;
 * `registry.extend(...)` is the existing tool for that. `limits` is
 * re-validated through `resolveCombinatorialLimit` whenever given (or
 * inherited, or defaulted), so a bad limit fails at `fork()`/`initialize()`
 * time rather than at first use. `clock` follows the given → inherited →
 * default shape `algorithm` does, but stays _unresolved_ only for the explicit
 * `"seeded"` sentinel: an explicit `Date` and the unconfigured wall-clock
 * default are stored as epoch milliseconds (a stated instant, inherited as-is
 * from then on), while `"seeded"` is left as the sentinel rather than collapsed
 * to a number, so `resolveClock` can re-derive it from whichever `seed` is
 * actually in effect at read time. An omitted `clock` on a `fork`/`wrap` whose
 * seed changed therefore keeps the parent's instant unless that parent was
 * itself `"seeded"`.
 */
export function overlay<$Registry extends PlainObject>(
  base: Partial<Config<PlainObject>>,
  over: Overlay<$Registry>,
): Config<$Registry> {
  const seed = inline((): Seed => {
    if (typeof over.seed === "undefined") return normalizeSeed(base.seed);
    if (isLayered(over.seed))
      return [...normalizeSeed(base.seed), ...normalizeSeed(over.seed[Layer])];
    return normalizeSeed(over.seed);
  });

  const clock = inline((): number | "seeded" => {
    if (over.clock === "seeded") return "seeded";
    if (typeof over.clock !== "undefined") return over.clock.valueOf();
    return base.clock ?? Date.now();
  });

  return {
    seed,
    clock,
    algorithm: over.algorithm ?? base.algorithm ?? defaultAlgorithm,
    attribution: over.attribution
      ? resolveAttribution(over.attribution)
      : (base.attribution ?? resolveAttribution(undefined)),
    types: (over.types ?? base.types ?? registry) as $Registry,
    limits: {
      combinatorial: resolveCombinatorialLimit(
        (over.limits ?? base.limits)?.combinatorial,
      ),
    },
  };
}

/**
 * The shared body `initialize` and `fork` both reduce to: build a
 * `RandomSource` from an already-resolved `Config`, then everything an
 * `Instance` exposes off of it. Returns the `RandomSource` alongside the
 * `Instance` — `initialize`/`fork` discard it, `wrap` keeps it to stash on the
 * `Frame` it pushes, so implicit (ambient) and explicit (`scope.Fabricator`)
 * construction inside one `wrap` resolve against the very same source rather
 * than each independently re-deriving one from the same config (and so silently
 * diverging/duplicating construction ordinals).
 *
 * `stack` is threaded straight through to `Constructor`/`enumerables` — this
 * function never reads or writes it itself, only passes it along so every built
 * `Fabricator`/`combinatorial`/`coverage` can consult whichever frame is active
 * _at the moment each is called_, not at this moment.
 */
export function instantiate<$Registry extends PlainObject>(
  config: Config<$Registry>,
  stack: Stack,
): { instance: Instance<$Registry>; source: RandomSource } {
  const source = toRandomSource({
    seed: config.seed,
    algorithm: config.algorithm,
    attribution: config.attribution,
    clock: resolveClock(config),
  });

  const Fabricator = Constructor(source, stack);
  const { combinatorial, coverage } = enumerables(source, config.limits, stack);

  function fork<const $ForkRegistry extends PlainObject = $Registry>(
    forkOverlay: Overlay<$ForkRegistry> = {},
  ): Instance<$ForkRegistry> {
    return instantiate(overlay<$ForkRegistry>(config, forkOverlay), stack)
      .instance;
  }

  /**
   * Lays `wrapOverlay` over the _active frame's_ config when one exists, not
   * over `config` (this instance's own) — the asymmetry with `fork` above: a
   * nested `wrap({ seed: layer(...) })` accumulates onto whatever `wrap`
   * already surrounds it, while a `fork` always stays a statement about its own
   * parent alone.
   */
  function wrap<$Return, const $WrapRegistry extends PlainObject = $Registry>(
    wrapOverlay: Overlay<$WrapRegistry>,
    block: (scope: Instance<$WrapRegistry>) => $Return,
  ): $Return {
    const base = stack.current()?.config ?? config;
    const scopedConfig = overlay<$WrapRegistry>(base, wrapOverlay);
    const scoped = instantiate<$WrapRegistry>(scopedConfig, stack);

    const result = stack.enter(
      { config: scopedConfig, source: scoped.source },
      () => block(scoped.instance),
    );

    /**
     * A synchronous carrier has already popped the frame by now — `enter`
     * returns `block()` without awaiting, so an `async` block's frame unwound
     * at its first `await`. Anything built past that point would resolve
     * against the base instance with no signal, so refuse the call instead.
     *
     * Thrown synchronously, so it surfaces at the `wrap` call site rather than
     * inside a promise the caller may never await — and `result` is neutered
     * first, since abandoning an in-flight promise would otherwise surface as
     * an unhandled rejection on top of the error actually worth reading.
     */
    if (!stack.asynchronous && isThenable(result)) {
      result.then(noop, noop);
      throw new FabricatorError.SynchronousStackError();
    }

    return result;
  }

  /**
   * Getters, not a snapshot — must reflect whichever frame is active at _read_
   * time, since this one `Instance` outlives any number of `wrap`s entered and
   * exited around it. `config.seed` is already normalized by `overlay()`, but
   * `normalizeSeed` is called again here regardless, since `Config.seed`'s
   * declared type is the caller-facing `Seed`, not `ReadonlyArray<string>` (see
   * `Config`) — a no-op on an already-normalized array, but what actually
   * satisfies `Context.seed`'s type.
   */
  const context: Context = {
    get seed() {
      return normalizeSeed((stack.current()?.config ?? config).seed);
    },
    get algorithm() {
      return (stack.current()?.config ?? config).algorithm;
    },
    get attribution() {
      return (stack.current()?.config ?? config).attribution;
    },
    get clock() {
      return resolveClock(stack.current()?.config ?? config);
    },
  };

  const instance: Instance<$Registry> = {
    T: config.types,
    Fabricator,
    combinatorial,
    coverage,
    seed: source.seed,
    fork,
    wrap,
    context,
  };

  return { instance, source };
}
