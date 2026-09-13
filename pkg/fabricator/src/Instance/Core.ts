import { enumerables } from "../Enumeration/Enumerate";
import { FabricatorError } from "../Error";
import { Constructor } from "../Fabricator/Constructor";
import {
  defaultAlgorithm,
  deriveClock,
  isLayered,
  normalizeSalt,
  toRandomSource,
} from "../Random";
import type { RandomSource, Salt } from "../Random/Types";
import { registry } from "../Schema/Registry";
import { Layer } from "../Types";
import { inline, isThenable, noop } from "../Utility/Core";
import type { PlainObject } from "../Utility/Types";
import { toInnermostFrame } from "./Stack/Visible";
import type {
  Ancestry,
  Config,
  Context,
  Instance,
  Overlay,
  Stack,
  Token,
} from "./Types";

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
 * already-resolved number passes through; the unresolved `"derived"` policy
 * derives fresh from this exact `config`'s own `algorithm`/`salt`. Called
 * wherever the clock actually matters — `instantiate` (to hand a number onward
 * to `Constructor`/`enumerables`) and the `context.clock` getter (which must
 * resolve per read anyway, since the active `wrap` frame can change) — never
 * cached on the `Config` itself, so an explicit `"derived"` clock re-derives
 * when the salt it composes changes (see `Config`, `Instance/Types.ts`). The
 * unconfigured default is a wall-clock number from `overlay()`, not this
 * sentinel.
 */
function resolveClock(config: Config<PlainObject>): number {
  return typeof config.clock === "number"
    ? config.clock
    : deriveClock(config.algorithm, normalizeSalt(config.salt));
}

/**
 * One fresh instance identity. A `Symbol` rather than a counter or an object so
 * it is unforgeable, unguessable, and cheap to compare; the description is for
 * debuggers only and is never read. The cast is the brand — {@link Token}'s
 * brand key is module-private to `Instance/Types.ts`, so this function is the
 * only way one comes into being.
 */
function mint(): Token {
  return Symbol("fabricator.instance") as Token;
}

/**
 * The single place a `Config` inherits from a base — `initialize` lays its own
 * config over an empty `{}` base (nothing to inherit, so every field falls
 * through to a hardcoded default: an empty salt, wall-clock `clock`, the
 * built-in algorithm, the default registry, the default combinatorial limit),
 * and `fork` lays its overlay over the instance it was called on (a full,
 * already-resolved `Config`, so every field has a real value to fall back to).
 * `base` is typed `Partial<Config<PlainObject>>` rather than `Config`
 * specifically so both calls go through the same function.
 *
 * `salt` composes onto the base rather than replacing it only when tagged with
 * `layer(...)` (`{@link isLayered}`) — a bare `salt` (the ordinary meaning
 * everywhere else in this library) replaces the base's outright, and an omitted
 * `salt` inherits the base's unchanged (or, at the root, an empty mixer via
 * `normalizeSalt(undefined)`, unless an env var supplies one). Wall-clock
 * `clock` is the default entropy; `salt` is an optional mixer.
 *
 * `algorithm`/`types`: wholesale replacement when given, matching how
 * `initialize({ types })` already behaves — no deep merge;
 * `registry.extend(...)` is the existing tool for that. `limits` is
 * re-validated through `resolveCombinatorialLimit` whenever given (or
 * inherited, or defaulted), so a bad limit fails at `fork()`/`initialize()`
 * time rather than at first use. `clock` follows the given → inherited →
 * default shape `algorithm` does, but stays _unresolved_ only for the explicit
 * `"derived"` sentinel: an explicit `Date` and the unconfigured wall-clock
 * default are stored as epoch milliseconds (a stated instant, inherited as-is
 * from then on), while `"derived"` is left as the sentinel rather than
 * collapsed to a number, so `resolveClock` can re-derive it from whichever
 * `salt` is actually in effect at read time. An omitted `clock` on a
 * `fork`/`wrap` whose salt changed therefore keeps the parent's instant unless
 * that parent was itself `"derived"`.
 */
export function overlay<$Registry extends PlainObject>(
  base: Partial<Config<PlainObject>>,
  over: Overlay<$Registry>,
): Config<$Registry> {
  const salt = inline((): Salt => {
    if (typeof over.salt === "undefined") return normalizeSalt(base.salt);
    if (isLayered(over.salt))
      return [...normalizeSalt(base.salt), ...normalizeSalt(over.salt[Layer])];
    return normalizeSalt(over.salt);
  });

  const clock = inline((): number | "derived" => {
    if (over.clock === "derived") return "derived";
    if (typeof over.clock !== "undefined") return over.clock.valueOf();
    return base.clock ?? Date.now();
  });

  return {
    salt,
    clock,
    algorithm: over.algorithm ?? base.algorithm ?? defaultAlgorithm,
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
 * `stack` and `ancestry` are threaded straight through to
 * `Constructor`/`enumerables` — this function never reads the stack itself,
 * only passes both along so every built `Fabricator`/`combinatorial`/`coverage`
 * can consult whichever frame is visible to _this_ instance _at the moment each
 * is called_, not at this moment.
 *
 * `parent` describes the instance this one is derived from, and its absence is
 * the single marker of a root: `initialize` passes none, every `fork`/`wrap`
 * passes the receiver's.
 *
 * A fresh token is minted either way, so no two instances share an identity,
 * and the `ancestry` built here is _this_ instance's: the parent's plus one.
 */
export function instantiate<$Registry extends PlainObject>(
  config: Config<$Registry>,
  stack: Stack,
  parent?: { ancestry: Ancestry; root: Instance<PlainObject> },
): { instance: Instance<$Registry>; source: RandomSource } {
  const ancestry: Ancestry =
    typeof parent === "undefined" ? [mint()] : [...parent.ancestry, mint()];

  const source = toRandomSource({
    salt: config.salt,
    algorithm: config.algorithm,
    clock: resolveClock(config),
  });

  const Fabricator = Constructor(source, stack, ancestry);
  const { combinatorial, coverage } = enumerables(
    source,
    config.limits,
    stack,
    ancestry,
  );

  /**
   * The one derivation `fork` and `wrap` share: lay `over` on _this instance's_
   * config and instantiate a child of it. They differ only in what they do with
   * the result — `fork` returns the instance and drops the rest, `wrap` needs
   * the resolved `config` and `source` too, for the frame it pushes.
   */
  function derive<const $Derived extends PlainObject = $Registry>(
    over: Overlay<$Derived>,
  ): {
    config: Config<$Derived>;
    instance: Instance<$Derived>;
    source: RandomSource;
  } {
    const derived = overlay<$Derived>(config, over);

    return {
      ...instantiate<$Derived>(derived, stack, {
        ancestry,
        root: instance.root,
      }),
      config: derived,
    };
  }

  function fork<const $ForkRegistry extends PlainObject = $Registry>(
    forkOverlay: Overlay<$ForkRegistry> = {},
  ): Instance<$ForkRegistry> {
    return derive<$ForkRegistry>(forkOverlay).instance;
  }

  /**
   * `derive` made ambient: the overlay lays over this instance's own config,
   * same as `fork`, and the scope is then pushed as a frame for the extent of
   * `block`. `wrap` writes the stack and never reads it — every read lives in
   * `resolveScope`, `effectiveSource`, and the `context` getters — so what an
   * overlay inherits from no longer depends on what happens to be open around
   * the call.
   *
   * The frame is keyed on `ancestry`, **this** instance's, not the scope's: the
   * scope is a fresh child, so keying on it would make every `fork` already
   * taken off this instance a sibling of the scope, and calls on those forks
   * would stop resolving against the frame. Keying on the origin keeps this
   * instance's whole line resolving against it — the forks that predate the
   * `wrap` included — while leaving a genuine sibling untouched (see
   * {@link Ancestry}).
   */
  function wrap<$Return, const $WrapRegistry extends PlainObject = $Registry>(
    wrapOverlay: Overlay<$WrapRegistry>,
    block: (scope: Instance<$WrapRegistry>) => $Return,
  ): $Return {
    const scoped = derive<$WrapRegistry>(wrapOverlay);

    const result = stack.enter(
      {
        config: scoped.config,
        source: scoped.source,
        instance: scoped.instance,
        ancestry,
      },
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
   * The innermost frame _this_ instance may resolve against, or `undefined`
   * outside any. Read fresh per access, never closed over: which frames are
   * visible depends on what is open right now, and on this instance's own
   * `ancestry` — a frame entered on a sibling is never one of them.
   */
  function visibleFrame() {
    return toInnermostFrame(stack, ancestry);
  }

  /**
   * Getters, not a snapshot — must reflect whichever frame is visible at _read_
   * time, since this one `Instance` outlives any number of `wrap`s entered and
   * exited around it. `config.salt` is already normalized by `overlay()`, but
   * `normalizeSalt` is called again here regardless, since `Config.salt`'s
   * declared type is the caller-facing `Salt`, not `ReadonlyArray<string>` (see
   * `Config`) — a no-op on an already-normalized array, but what actually
   * satisfies `Context.salt`'s type.
   *
   * `scope` is a function rather than a fifth getter: it is acted through
   * rather than read, so freezing it would yield correct-looking code laying
   * over the wrong base instead of a visibly stale value (see `Context`). As a
   * function it survives destructuring.
   */
  const context: Context = {
    get salt() {
      return normalizeSalt((visibleFrame()?.config ?? config).salt);
    },
    get algorithm() {
      return (visibleFrame()?.config ?? config).algorithm;
    },
    get clock() {
      return resolveClock(visibleFrame()?.config ?? config);
    },
    scope: () => visibleFrame()?.instance ?? instance,
    get depth() {
      return stack.visible(ancestry).length;
    },
  };

  const instance: Instance<$Registry> = {
    T: config.types,
    ancestry,
    /**
     * A getter, so the root can name itself without a mutable local: `instance`
     * is declared by this very statement, and a getter body runs only on read —
     * the same forward reference `context.scope()` already relies on. Every
     * descendant is handed this instance's own `root` by `derive`, so one
     * object is shared by the whole lineage rather than re-derived per
     * instance.
     */
    get root() {
      return parent?.root ?? instance;
    },
    Fabricator,
    combinatorial,
    coverage,
    salt: source.salt,
    fork,
    wrap,
    context,
  };

  return { instance, source };
}
