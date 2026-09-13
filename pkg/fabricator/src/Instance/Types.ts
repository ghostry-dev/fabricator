import type { Enumerable, Limits } from "../Enumeration/Types";
import type { Constructor } from "../Fabricator/Constructor";
import type { Algorithm, Layered, RandomSource, Salt } from "../Random/Types";
import type { PlainObject } from "../Utility/Types";

/**
 * A fully resolved instance configuration — every field present, nothing left
 * to default. `Overlay` is what `fork` accepts; `overlay()`
 * (`Instance/Core.ts`) is the only thing producing a complete `Config`.
 *
 * `salt` is declared at its caller-facing `Salt` type but always holds the
 * normalized array once `overlay()` has run (`Instance.salt` is the
 * authoritative read). `clock` holds _either_ a resolved instant (epoch
 * milliseconds) or the unresolved `"derived"` policy — never collapsed to a
 * number by `overlay()` when `"derived"`, because that policy must re-derive
 * whenever the salt it composes changes (a `fork({ salt: layer(...) })`). The
 * unconfigured default is a wall- clock number, inherited as-is like an
 * explicit `Date`. `resolveClock` (`Instance/Core.ts`) is the one place that
 * resolves `"derived"` to a number, called fresh wherever the clock actually
 * matters (`instantiate`, the `context.clock` getter) rather than once here.
 */
export type Config<$Registry extends PlainObject> = {
  readonly salt: Salt;
  readonly algorithm: Algorithm;
  readonly types: $Registry;
  readonly limits: Limits;
  readonly clock: number | "derived";
};

/**
 * What `fork` accepts — a `Config` to lay over a base, every field optional.
 * Identical to `Partial<Config>` but for `salt`, which additionally accepts a
 * {@link Layered}: a bare `Salt` replaces the base's salt outright (what `salt`
 * means everywhere else in this library), `layer(salt)` appends onto it
 * (`[...base.salt, ...salt]`) — the shape a wrapping integration wants, and
 * what `ConstructorOptions`' layered form is for a single construction.
 * Omitting `salt` inherits the base's unchanged. `clock` similarly accepts the
 * caller-facing `Date | "derived"` rather than `Config`'s own resolved `number
 * | "derived"`, so a caller can hand in a literal instant without converting it
 * to epoch milliseconds themselves. `"derived"` is the explicit opt-in that
 * derives "now" from the instance salt; omitting `clock` at the root captures
 * wall-clock time instead.
 *
 * `initialize`'s own parameter keeps a plain `salt?: Salt`, so passing
 * `layer(...)` there is a compile error: there is no base to layer onto at the
 * root.
 */
export type Overlay<$Registry extends PlainObject> = Partial<
  Omit<Config<$Registry>, "salt" | "clock">
> & {
  readonly salt?: Salt | Layered;
  readonly clock?: Date | "derived" | undefined;
};

declare const Brand: unique symbol;

/**
 * One instance's identity — minted fresh by every `instantiate`
 * (`Instance/Core.ts`) and never equal to any other. Branded, and the brand key
 * is module-private, so a token cannot be forged from outside this package: the
 * only way to hold one is to have been handed an `Instance`.
 */
export type Token = symbol & { readonly [Brand]: "Instance" };

/**
 * Where an instance sits in its lineage: every token from the root down to and
 * including its own, so `ancestry[0]` is the lineage identity (`a.ancestry[0]
 * === b.ancestry[0]` answers "same root?") and the last element is the instance
 * itself. Non-empty by construction — a root `initialize()` mints one token
 * before there is anything to inherit.
 *
 * Derived from the _receiver_: `fork` and `wrap` alike append to the ancestry
 * of the instance they were called on, exactly as they both lay their overlay
 * over that instance's `config`. One rule, so an instance's position and its
 * configuration always agree about who its parent is.
 *
 * Two chains describe instances on the same ancestral line when either is a
 * prefix of the other, which is what {@link Stack.visible} tests. That relation
 * decides whose calls resolve against whose frames: a parent's calls resolve
 * against a child's frame and a child's against a parent's, while two siblings
 * resolve against neither's. Note this never crosses lineages, and not for want
 * of identity — two roots hold two separate carriers, so a `wrap` on one pushes
 * where the other's reads never look.
 */
export type Ancestry = readonly [Token, ...ReadonlyArray<Token>];

/**
 * One active `wrap` — its resolved config plus the single `RandomSource` every
 * build reached inside that `wrap` shares, whether reached implicitly (any
 * instance on the origin's ancestral line consulting the frame) or explicitly
 * (`scope.Fabricator`, the `Instance` passed to the block). Storing the scope's
 * own already-built `source` here, rather than each consumer re-deriving one
 * from `config`, keeps the two routes resolving against the _same_ source —
 * sharing one set of construction-ordinal counters — instead of each silently
 * starting its own.
 *
 * `instance` is that same scope, kept so `context.scope()` can hand back the
 * configuration in effect as a usable `Instance` rather than only as its
 * separate `salt`/`algorithm`/`clock` fields.
 *
 * `ancestry` is the **origin's** — the instance `wrap` was called on — not the
 * scope's. The scope is a fresh child of the origin, so keying on it would make
 * every `fork` taken off that origin a _sibling_ of the scope, and calls on
 * those forks would stop resolving against the frame. Keying on the origin
 * keeps everything on the origin's own line resolving against it, which is the
 * whole point of entering one.
 */
export type Frame = {
  readonly config: Config<PlainObject>;
  readonly source: RandomSource;
  readonly instance: Instance<PlainObject>;
  readonly ancestry: Ancestry;
};

/**
 * The ambient frame carrier. Created once at a root `initialize()` and threaded
 * — never re-created — through every `fork`/`wrap` descended from it (see
 * `instantiate`, `Instance/Core.ts`).
 *
 * A carrier holds a chain of open frames and nothing else; which of them any
 * given reader may see is {@link Ancestry}'s business, resolved by
 * {@link visible}. Two unrelated `initialize()` calls hold separate carriers
 * and so stay fully isolated — and because a reader is now gated on ancestry
 * rather than on carrier identity, handing the _same_ carrier to two
 * `initialize()` calls does not join them either: their roots mint unrelated
 * tokens, so neither one's reads ever resolve the other's frames. `initialize({
 * stack })` is therefore purely a choice of carrier.
 */
export type Stack = {
  /**
   * Whether a frame survives an `await` inside the block it was entered for.
   *
   * `false` means the carrier is a plain LIFO whose frame unwinds at the
   * block's first suspension point — correct for synchronous use, and the
   * reason `wrap` (`Instance/Core.ts`) rejects an async block outright rather
   * than letting a build after the `await` silently resolve against the base
   * instance. See `Instance/Stack/Sync.ts` and `Instance/Stack/Async.ts`.
   */
  readonly asynchronous: boolean;

  /**
   * Every open frame `ancestry` may resolve against, outermost first: those
   * whose own `ancestry` is a prefix of this one or has this one as a prefix.
   * The innermost visible frame — what a build or a `context` read actually
   * resolves against — is the last element, and the count is `context.depth`.
   *
   * Filtering, rather than simply reporting the innermost frame, is what makes
   * the outward walk possible: with a parent's `wrap` open and a child's nested
   * inside it, the child's _sibling_ must skip the inner frame and still find
   * the outer one. Callers never filter themselves — `toVisible`
   * (`Instance/Stack/Visible.ts`) is the single definition both carriers
   * delegate to, so the rule cannot drift between them.
   */
  visible(ancestry: Ancestry): ReadonlyArray<Frame>;

  /**
   * Append `frame`, run `block`, remove it in a `finally`, so a frame unwinds
   * correctly even if `block` throws. Appends rather than replaces: the chain
   * has to stay intact for {@link visible} to walk outward past a frame this
   * reader cannot see.
   */
  enter<$Return>(frame: Frame, block: () => $Return): $Return;
};

/**
 * What is in effect _right now_ — the innermost `wrap` frame this instance's
 * calls can resolve against, or the instance itself when there is none.
 *
 * The four value properties are getters, so they are a live view only while
 * this stays an object: destructuring one, or spreading the object, calls that
 * getter once and freezes the result.
 *
 * {@link Context.scope} is deliberately a **function** rather than another
 * getter: it is the one member a caller _acts through_ rather than reads, so
 * freezing it would yield correct-looking code deriving from the wrong base. As
 * a function it survives destructuring — `const { scope } = instance.context`,
 * then `scope()`, still resolves live. Distinct from `ConstructionContext`
 * (`Fabricator/Types.ts`), which is one construction's internal dispatch
 * plumbing; this is the caller-facing "what is in effect."
 */
export type Context = {
  readonly salt: ReadonlyArray<string>;
  readonly algorithm: Algorithm;
  readonly clock: number;

  /**
   * The configuration in effect as an `Instance` — the visible frame's own
   * scope, or this instance outside any. This is how to compose deliberately
   * against whatever is active: `context.scope().wrap({ salt: layer("x") },
   * ...)` lays over the frame in effect, where a plain `wrap` lays over the
   * instance it was called on. Unlike rebuilding an overlay out of `salt` by
   * hand, it carries `types`, `limits`, `algorithm` and `clock` across too.
   *
   * A function, not a getter, so capturing it captures the _lookup_ rather than
   * one answer (see this type's own note above). What it returns is an ordinary
   * `Instance`, fixed like any other — so holding the **result** across a frame
   * change is a caller stating they wanted that one, while holding `scope`
   * itself stays live.
   */
  scope(): Instance<PlainObject>;

  /**
   * How many frames are currently visible to this instance — 0 outside any.
   * Genuine dynamic nesting depth, counted off the carrier rather than inferred
   * from {@link Ancestry}: a frame a sibling cannot see is not counted for that
   * sibling, and entering two `wrap`s on one instance reads as 2 even though
   * neither deepened anyone's ancestry.
   */
  readonly depth: number;
};

/**
 * A single initialized library instance: the registry it was given, and a
 * `construct()` bound to its own isolated randomness — its own salt, builder,
 * and construction counter/streams, held internally and never shared with any
 * other `initialize()` call. Independently initialized instances (e.g. parallel
 * tests) can never perturb each other.
 */
export interface Instance<$Registry extends PlainObject> extends Pick<
  RandomSource,
  "salt"
> {
  /** The registry of type definers this instance was initialized with. */
  readonly T: $Registry;

  /**
   * This instance's position in its lineage — see {@link Ancestry}. Exposed so a
   * caller can reason about which frames a given instance's calls resolve
   * against; the tokens themselves are opaque and comparable only by identity.
   * For the ordinary "same lineage?" question, compare {@link root} instead.
   */
  readonly ancestry: Ancestry;

  /**
   * The instance at the head of this lineage — the one `initialize()` returned.
   * A root's own `root` is itself, so this is never `undefined` and no caller
   * handles absence.
   *
   * Its job is identity: `a.root === b.root` answers "same lineage?", which is
   * what `fork`/`wrap` descent preserves and what two separate `initialize()`
   * calls never share — even when handed the same `stack`.
   *
   * It is **not** a way to reach "the ambient instance": every instance in a
   * lineage resolves against the frames on its own line, so there is nothing to
   * reach for. Nor is it a configuration to build against in preference to this
   * one — `root`'s config is the lineage's starting point, not whatever is
   * currently in effect. For that, see {@link Context.scope}.
   *
   * Typed at `PlainObject`, which is a deliberate shortcut rather than a
   * necessity — unlike {@link Context.scope}, whose registry depends on which
   * instance entered the innermost visible frame and so cannot be known
   * statically at all.
   *
   * A root's registry is fixed at `initialize` and nothing later disturbs it: a
   * `fork({ types })` mints a _new_ instance with a different registry and
   * leaves the root exactly as it was. What is lost is the descendant's ability
   * to name it — after such a fork this instance's `$Registry` is the fork's,
   * so the root's is no longer recoverable from it. Typing this
   * `Instance<$Registry>` would therefore be wrong if someone overrode
   * `types`.
   *
   * Recovering it would mean threading a second parameter (`Instance<$Registry,
   * $Root>`) through `fork` and `wrap`, which is a poor trade for an accessor
   * whose job is identity: if you mean to _build_, you want the registry of the
   * instance you are holding, not the one the lineage started from. So `root.T`
   * is untyped, while `root.Fabricator` is unaffected since it carries no
   * registry parameter.
   */
  readonly root: Instance<PlainObject>;

  /**
   * Turn a Schema built from `T` into a live Fabricator, deriving fresh
   * randomness from this instance's own salt for whichever leaves actually need
   * it.
   */
  Fabricator: Constructor;

  /**
   * Every combination of every enumerable node in `schema` — every enum member,
   * both sides of an optional field, and so on — as a cartesian product,
   * lazily. Throws eagerly, before producing anything, if the count exceeds
   * `limits.combinatorial` (see `initialize`'s config).
   */
  combinatorial: Enumerable;

  /**
   * The minimum set of instances such that every option of every enumerable
   * node in `schema` appears at least once — count equal to the _widest_ single
   * axis, not the product, with narrower axes cycling to fill it. Unbounded:
   * its count can never exceed the schema as written, so unlike `combinatorial`
   * it carries no limit.
   */
  coverage: Enumerable;

  /**
   * Derive a new instance laid over this one: anything the overlay names
   * overrides, anything it omits inherits. A bare `salt` replaces this
   * instance's salt; `salt: layer(...)` appends onto it. A peer of an
   * `initialize()` return value in every respect, including its own `fork`.
   */
  fork<const $ForkRegistry extends PlainObject = $Registry>(
    overlay?: Overlay<$ForkRegistry>,
  ): Instance<$ForkRegistry>;

  /**
   * `fork(overlay)`, made ambient for the synchronous extent of `block`: every
   * `new Fabricator(...)`, `combinatorial(...)`, and `coverage(...)` reached
   * inside — on this instance or any other in the same lineage — resolves
   * against the fork instead, with nothing threaded through. The fork is also
   * passed to `block`: use it explicitly where that reads better, and
   * _necessarily_ for any async work, which the ambient frame does not survive
   * — a build reached after an `await` inside `block` sees this instance's own
   * configuration again, not the wrap's.
   *
   * The overlay lays over _this instance's_ config, exactly as `fork`'s does,
   * whether or not a frame is already open. So a nested `wrap` accumulates when
   * it is called on the enclosing scope — `wrap(a, (scope) => scope.wrap(b,
   * ...))` — and restates from this instance when it is called on a receiver
   * bound outside, as a destructured `wrap` is. To compose onto whatever is
   * active regardless of receiver, go through `context.scope().wrap(...)`.
   *
   * While the block runs, calls made on this instance's ancestral line resolve
   * against the scope — its forks, their forks, and its own ancestors up to the
   * root. Calls on a _sibling_ do not: a frame entered on one `fork` is not one
   * that another `fork` of the same parent can resolve against, which keeps two
   * unrelated derivations from drawing each other's data. See
   * {@link Ancestry}.
   */
  wrap<$Return, const $WrapRegistry extends PlainObject = $Registry>(
    overlay: Overlay<$WrapRegistry>,
    block: (scope: Instance<$WrapRegistry>) => $Return,
  ): $Return;

  /**
   * The configuration in effect right now: the innermost active `wrap` frame's,
   * or this instance's own outside any `wrap`. A live view, not a snapshot —
   * reflects whichever frame is active at the moment each property is read,
   * since one `Instance` outlives any number of `wrap`s.
   */
  readonly context: Context;
}
