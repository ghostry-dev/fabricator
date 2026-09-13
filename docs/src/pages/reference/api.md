# Public API

The package's `.` entry point — small on purpose, and scoped to _using_ fabricator: every primitive is reached through `T`, not imported directly, and everything here either drives that loop (`initialize`, `registry`), supports it (`Trace`, `Omitted`, `FabricatorError`, `Stream`, `Fabrication`, `ValueOf`, `layer`, `Layered`, `Config`, `Overlay`, `Context`, `Stack`), or is what an ordinary `.adapt(adapter, produce)` call needs (`Adapting`). _Extending_ fabricator is each its own entry point — `@ghostry/fabricator/adapting` for implementing a schema adapter, `@ghostry/fabricator/harnessing` for integrating with a test runner through `@ghostry/harness`, `@ghostry/fabricator/internal` for the structural tools an adapter needs.

## `initialize(config?)`

```ts
function initialize(config?: {
  types?: Registry;
  salt?: Salt;
  algorithm?: (seed: string) => () => number;
  limits?: { combinatorial: number };
  clock?: Date | "derived";
  stack?: Stack;
}): Instance;
```

Mints one isolated instance. `types` defaults to the built-in `registry`; `salt` defaults to empty if omitted (unless `FABRICATOR_SALT` supplies one — which pins the salt only, not `clock`); `algorithm` defaults to a built-in `sfc32` generator. `limits.combinatorial` caps how many instances `combinatorial(...)` (below) may enumerate before throwing — defaults to `1024`, checked eagerly at `initialize()` time, not on first call. `clock` is what `T.date.past`/`T.date.future` (and any producer reading its `ProduceContext`) resolve "now" against, and the default entropy for the instance: it defaults to the wall-clock instant of this `initialize()` call. Pass a `Date` to pin "now" to a specific instant, or `clock: "derived"` to derive "now" from the instance salt (an instant drawn across the entire representable `Date` range). See [Reproducibility](/guides/reproducibility) and [Custom types](/guides/custom-types).

`new Fabricator(schema, { salt })` overrides the salt for one construction. Like every other option here it pins a single `.trace` slot and changes nothing else: the build still takes the next ordinal from the instance's construction counter and still inherits the instance's `clock` (see [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy)). `new Fabricator(schema, { salt: layer(identity) })` pins the same slot but _composes_ `identity` onto the instance's own salt instead of replacing it, so the construction still varies when the instance is re-salted — see [`layer(salt)`](#layersalt) below.

`stack` overrides the ambient carrier backing [`wrap`](#instancewrapoverlay-block), and is almost never worth setting. Left alone, the right one is chosen when the package is imported: every runtime with `node:async_hooks` gets an `AsyncLocalStorage` carrier whose frames survive `await`, and anything else gets a synchronous one. Supply your own — anything satisfying `Stack` — to bring async-capable `wrap` to a runtime that would otherwise fall back, or to force the synchronous carrier deliberately.

`salt` is one of these; `new Fabricator(schema, options)` accepts every slot of a captured `Trace` — `salt`, `clock`, `path`, `kind`, `ordinal` — so `new Fabricator(schema, built.trace)` replays that node. A given `ordinal` — including `null`, which `combinatorial`/`coverage` builds record in place of one — is taken verbatim and does not advance the instance's construction counter, which is what makes the replay exact. `kind` must match the schema or the constructor throws. A nested node's `path` is the base `make` extends for descendants, so replaying a nested `object` reproduces its subtree. See [Reproducibility](/guides/reproducibility) for the full trade-offs, including the cases that still need the parent (`.refine()` compute fields, `recursive.self`, `.override()` `[Fixed]` fields).

## `Instance`

The shape `initialize()` returns:

- **`T`** — the registry of type builders, `types` (or the default) as passed
- **`Fabricator`** — a constructor: `new Fabricator(schema)` turns a Schema into a live Fabricator
- **`salt`** — this instance's salt, always an array; empty if you didn't supply one (and no env var did)
- **`combinatorial(schema)`** — every combination of every enumerable node in `schema` (every enum member, both sides of an optional field, and so on), as a lazy cartesian product. Throws eagerly, before producing anything, if the count would exceed `limits.combinatorial`.
- **`coverage(schema)`** — the minimum set of instances such that every option of every enumerable node in `schema` appears at least once — count equal to the widest single axis, not the product, with narrower axes cycling to fill it. Unbounded by design: its count can never exceed the schema as written, so unlike `combinatorial` it carries no limit.
- **`fork(overlay?)`** — derives a new, related `Instance`, the ordinary way to vary configuration. See [`Instance.fork(overlay?)`](#instanceforkoverlay) below.
- **`wrap(overlay, block)`** — makes a fork ambient for a block of code, for when the scope cannot reach the code that needs it. See [`Instance.wrap(overlay, block)`](#instancewrapoverlay-block) below.
- **`root`** — the head of this instance's lineage, for identity. See [`Instance.root`](#instanceroot) below.
- **`context`** — what is in effect right now. See [`Instance.context`](#instancecontext) below.
- **`ancestry`** — this instance's position in its lineage, as an opaque chain of per-instance tokens. Exposed so a caller can reason about which frames an instance's calls resolve against; for "same lineage?", compare `root`.

Both `combinatorial` and `coverage` return a lazy, re-iterable `Iterable` — safe to iterate more than once, each pass drawing fresh randomness for whatever the enumeration didn't pin.

## `Instance.fork(overlay?)`

```ts
function fork(overlay?: Overlay): Instance;
```

The ordinary way to vary configuration, and the one to reach for before `wrap`: a fork is a value, so every receiver means exactly itself and nothing depends on what is open around the call site.

Derives a new `Instance` laid over the one `fork` was called on: whatever `overlay` names overrides, whatever it omits inherits — `salt`, `algorithm`, `types`, `limits`, `clock`, all included. A fork is a full peer of an `initialize()` return value in every respect, including its own `fork`/`wrap`. A captured wall-clock or explicit `Date` is inherited as-is; an inherited `"derived"` clock re-derives from whichever salt the fork ends up with — see [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy).

```ts
const base = initialize({ salt: "base" });

const tenant = base.fork({ salt: "tenant-7" });
tenant.salt; // ["tenant-7"] — replaced, the ordinary meaning of `salt`

const layered = base.fork({ salt: layer("tenant-7") });
layered.salt; // ["base", "tenant-7"] — composed instead
```

## `Instance.wrap(overlay, block)`

```ts
function wrap<$Return>(
  overlay: Overlay,
  block: (scope: Instance) => $Return,
): $Return;
```

Prefer [`fork`](#instanceforkoverlay) unless the scope cannot reach the code that needs it — a callback you don't own, a deep call stack, or call sites already written against a destructured `Fabricator`. Inside a `wrap`, a receiver no longer tells you which configuration a call draws from; that is what a `wrap` is for, and the reason it is not the default recommendation.

`fork(overlay)`, made ambient for the extent of `block`: every `new Fabricator(...)`, `combinatorial(...)`, and `coverage(...)` reached while `block` runs — on the instance `wrap` was called on, or on any other instance on that instance's ancestral line — resolves against the fork automatically, with nothing threaded through. `block` also receives the fork directly, as `scope`, for explicit use:

```ts
const { T, Fabricator, wrap } = initialize({ salt: "base" });

wrap({ salt: layer("a") }, (scope) => {
  new Fabricator(T.number).fabricate(); // picks up the wrap automatically
  new scope.Fabricator(T.number).fabricate(); // the same source, used explicitly
});
```

The overlay lays over the instance `wrap` was called on, exactly as `fork`'s does, whether or not a `wrap` is already open around the call. So a nested `wrap` accumulates when it is reached through the enclosing `scope`, and restates when it is reached through a receiver bound outside — which a destructured `wrap` always is:

```ts
wrap({ salt: layer("a") }, (scope) => {
  scope.wrap({ salt: layer("b") }, (inner) => {
    inner.salt; // [...base.salt, "a", "b"] — composed
  });

  wrap({ salt: layer("b") }, (inner) => {
    inner.salt; // [...base.salt, "b"] — restated from the base instance
  });
});
```

To compose onto whatever is in effect without holding the enclosing `scope`, go through [`context.scope()`](#instancecontext). A bare (non-layered) `salt` replaces outright either way.

Which calls resolve against the frame follows the receiver's ancestral line: calls on that instance, on anything forked from it, and on its own ancestors up to the root — but never on a _sibling_ fork. See [Ambience follows the ancestral line](/guides/reproducibility#ambience-follows-the-ancestral-line).

`block` may be `async`. On any runtime with `node:async_hooks` — Node, Bun, Deno — the ambient frame is carried by `AsyncLocalStorage`, so it survives `await`, and two concurrent `wrap`s never see each other's configuration:

```ts
await wrap({ salt: layer("a") }, async () => {
  await loadFixtures();
  new Fabricator(T.number).fabricate(); // still the wrap's configuration
});
```

Anywhere else — a browser bundle, or an `initialize({ stack })` given a synchronous carrier — a frame cannot outlive the block's first `await`. Rather than let a later build resolve against the base instance unannounced, `wrap` throws `SynchronousStackError` as soon as it sees `block` return a promise. The check is on the block, not on what it does: it fires even if the block only ever touches `scope`, because whether something later reads the ambient frame is not knowable from `wrap`. Keep the block synchronous, or hand `initialize({ stack })` an async-capable carrier.

See [When you cannot thread the scope: wrap](/guides/reproducibility#when-you-cannot-thread-the-scope-wrap) for the full walkthrough, including why `fork` is the better default choice.

## `Instance.root`

```ts
readonly root: Instance;
```

The instance at the head of this lineage — the one `initialize()` returned. A root's own `root` is itself, so it is never `undefined` and no caller has to handle absence.

Its job is identity. `a.root === b.root` answers "same lineage?", which `fork`/`wrap` descent preserves and which two separate `initialize()` calls never share, even when handed the same `stack`:

```ts
const base = initialize({ salt: "base" });
const tenant = base.fork({ salt: layer("tenant-7") });

tenant.root === base; // true
base.root === base; // true — a root names itself
initialize({ salt: "base" }).root === base; // false
```

It is **not** a way to reach "the ambient instance" — every instance in a lineage resolves against the frames on its own line, so there is nothing to reach for. Nor is it the configuration to build against in preference to the one you hold: `root`'s config is where the lineage started, not what is in effect now. For that, see [`context.scope()`](#instancecontext).

Typed as `Instance` with an unparameterized registry. A root's registry is fixed at `initialize` and nothing later changes it — a `fork({ types })` mints a new instance and leaves the root alone. What a descendant loses is the ability to _name_ it: after such a fork its own `$Registry` is the fork's, so the root's is no longer recoverable from it. Recovering it would mean threading a second type parameter through `fork` and `wrap`, which is not worth it for an accessor whose job is identity — if you mean to build, you want the registry of the instance you hold. So `root.T` is untyped; `root.Fabricator` is unaffected, carrying no registry parameter.

This is a different situation from [`context.scope()`](#instancecontext), whose registry depends on which instance entered the innermost visible frame and so cannot be known statically at all.

## `Instance.context`

```ts
readonly context: {
  salt: readonly string[];
  algorithm: (seed: string) => () => number;
  clock: number;
  depth: number;
  scope(): Instance;
};
```

What is in effect right now: the innermost `wrap` frame this instance can see, or the instance itself outside any. A live view, not a snapshot — a `context` reference held onto before a `wrap` still reflects it while active, and reverts once the `wrap` ends. `clock` is always a resolved epoch-millisecond number, even under `"derived"` — see [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy).

`scope()` returns that configuration as a usable `Instance` — the frame's own scope, or this instance outside one. It is how to compose against whatever is active from a receiver bound elsewhere:

```ts
const { wrap, context } = initialize({ salt: "base" });

wrap({ salt: layer("a") }, () => {
  context.scope().wrap({ salt: layer("b") }, (inner) => {
    inner.salt; // [...base.salt, "a", "b"]
  });
});
```

Unlike rebuilding an overlay out of `context.salt` by hand, it carries `types`, `limits`, `algorithm` and `clock` across as well.

`depth` is how many frames an instance's own calls can resolve against, `0` outside any — real nesting depth, so a frame entered on a sibling fork does not count toward it.

The four value properties are getters, so **destructure `context` itself, never those**. Holding the object keeps the live view; pulling one out calls its getter once and freezes the result, as does spreading (`{ ...context }`):

```ts
const { context } = initialize({ salt: "base" }); // live
const { salt } = instance.context; // a snapshot, taken right now
```

`scope` is exempt, and is a function for exactly that reason. It is the one member you _act through_ rather than read, so freezing it would not show up as an obviously stale value — an ambient build through the captured instance would still be correct while `wrap`/`fork` on it laid over the wrong base. Capturing a function captures the lookup instead, so this stays live:

```ts
const { scope } = instance.context;
wrap({ salt: layer("a") }, () => {
  scope(); // the frame's scope, resolved now — not when it was destructured
});
```

The `Instance` that `scope()` hands back is fixed, like any other instance. Holding that result across a frame change is a caller saying they wanted that one; holding `scope` keeps you live.

## `layer(salt)`

```ts
function layer(salt: Salt): Layered;
```

Tags a salt as composing onto whatever base is in effect, rather than replacing it outright — the reading a bare `salt` has everywhere else in this library. Works identically wherever a `salt` is accepted against a base: `Instance.fork`, `Instance.wrap`, and a single `new Fabricator(schema, { salt })` call. See [Composing instead of replacing: layer(...)](/guides/reproducibility#composing-instead-of-replacing-layer) for the full picture.

## `registry`

The default set of type builders, exported so it can be extended via `registry.extend(({ T }) => ({ ... }))` before being passed to `initialize({ types })`. See [Custom types](/guides/custom-types).

## `fabricator.trace`

```ts
readonly trace: Trace;
```

Every built Fabricator records how its stream is derived: the instance salt, the resolved clock this construction resolves "now" against (see [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy)), its structural path within that construction, its kind, and which construction on the source it belongs to. Recording is unconditional — a bare `object` or `always` still has a `trace`, so a nested node can be rebuilt with `new Fabricator(schema, node.trace)`. Minting a stream from that trace is still paid only by nodes that draw. See [Reproducibility](/guides/reproducibility).

Three values are not a function of the node's own stream, so replaying the node standalone does not reproduce them: a `.refine()` compute field (throws without the parent object), a `recursive.self` node (throws without the enclosing `T.recursive`), and an `.override()` `[Fixed]` field (replays the drawn value the parent discarded). Replay the parent.

## `Omitted`

A sentinel value. Pass it to `.override(...)` or `.fabricate(overrides)` to force an [omittable](/reference/primitives/omittable) or [optional](/reference/primitives/optional) field off.

## `FabricatorError`

Every failure this library raises is an instance of this class — a schema-baked or per-call override rejected, a detached `self` reused outside its own `T.recursive` callback, an unrepresentable adaptation, and so on. Only the base class is exported; a specific failure is distinguished by `.name`, not by importing a subclass directly:

```ts
import { FabricatorError } from "@ghostry/fabricator";

try {
  // `name` is a `T.string` field — a number violates its kind
  Product.fabricate({ name: 5 as unknown as string });
} catch (e) {
  if (e instanceof FabricatorError) {
    // e.name, e.message — every subclass narrows the same way
  }
}
```

## `Stream` (type only)

The parameter type `T.opaque`'s producer receives — exported so a producer written as a named function has something to annotate its parameter with. See [`T.opaque`](/reference/primitives/opaque).

## `Fabrication<$Fabricator>` (type only)

Reads the value type a built Fabricator produces, straight off its `fabricate` signature:

```ts
import type { Fabrication } from "@ghostry/fabricator";

const Product = new Fabricator(ProductSchema);

type ProductValue = Fabrication<typeof Product>;
// same as: ReturnType<typeof Product.fabricate>

function seedDb(p: ProductValue) {
  /* ... */
}
```

## `ValueOf<$Schema>` (type only)

The Schema-level counterpart of `Fabrication` — reads the value type a Schema will eventually produce, before it's built into a Fabricator. Useful for a helper that accepts a Schema directly:

```ts
import type { ValueOf } from "@ghostry/fabricator";

type ProductSchemaValue = ValueOf<typeof ProductSchema>;
```

## Calling `.adapt(adapter, produce)`

**`Adapting<$Schema>`** — `{ schema, meta }`, the parameter type of every kind's `.adapt(adapter, produce)` producer. Exported from `.`, not `./adapting`, despite the name overlap: calling `.adapt()` to override one schema's mapping is an ordinary caller's business, not an adapter author's — the same reason `Stream`/`ProduceContext` are exported from `.` for `.as(produce)`. `meta` is the kind's own config, reachable here without importing the `Meta` well-known symbol from `./internal`.

```ts
const email = T.string.adapt(typebox, ({ meta }) =>
  Type.String({ format: "email", maxLength: meta.whereby.length.max.value }),
);
```

See [Adapting to an external schema library](/guides/typebox) for the full walkthrough.

## `@ghostry/fabricator/adapting`

A separate entry point for _authoring_ a schema adapter (e.g. [`@ghostry/fabricator-adapter-typebox-v0`](https://www.npmjs.com/package/@ghostry/fabricator-adapter-typebox-v0)) — not re-exported from `.`, since ordinary schema composition never needs it. Named for the activity rather than the `Adapter` noun, the same pattern `@ghostry/fabricator/harnessing` follows for supplying a test-framework integration. This package names no external schema library and depends on none: every mapping, and every dependency it needs, belongs to the adapter.

- **`Adapter<$Key, $Context, $Returnable>`** — the shape an adapter itself is: `{ key, convert }`. `convert` is the per-kind dispatch a conversion entry point (e.g. `toTypeBox`) calls.
- **`walk(schema, adapter, context)`** — walks a schema with an adapter, checking whether each node declared an adaptation for that adapter's `key` before falling back to the adapter's own `convert`.
- **`Recurse<$Context, $Returnable>`** — the callback `walk` hands an adapter's `convert` so nested schema nodes (an object field, an array element) get the same adaptation lookup as the root.
- **`Adaptation`** — the well-known symbol a Schema stores its per-adapter overrides under; read only by an adapter.
- **`Adaptations`** / **`AdaptationsOf<$Schema>`** — the runtime shape of that map, and the type-level read of what a given Schema declared.

## `@ghostry/fabricator/harnessing`

The entry point [`@ghostry/harness`](https://github.com/ghostry-dev/harness) integrates through — not re-exported from `.`, since only a test setup module needs it. Neither package depends on the other: the types here are fabricator's own copy of the part of that contract it uses, satisfied structurally. See [Harness](/guides/harness) for the setup.

- **`integration(instance)`** — decorates an existing instance as an integration; it never mints one, so the caller's `initialize(...)` owns the configuration, `clock` especially. Each test body runs inside `instance.wrap({ salt: layer(identity) }, ...)`, and no clock is ever set.
- **`Integration<$Context>`** — `{ name, provides, around }`, what `integration(...)` returns. `around(identity, body)` returns the body's value unchanged.
- **`Identity`** — `{ kind, path, name, row }`: `"test"` or `"suite"`, the enclosing `describe` names outer → inner, the test name (`""` for a suite hook), and the `.each` row index or `undefined`. It carries no file.
- **`Provider<$Value>`** / **`Provides<$Context>`** — one `(identity) => value` per context key; `provides` is the only source of an integration's keys.
- **`FabricatorTestContext<$Registry>`** — `{ fabricator }`, the per-test scoped `Instance` a test body receives.

Reading `provides.fabricator` outside that integration's `around` throws a `FabricatorError` named `HarnessingProviderError`. Only a composer breaking the contract does that; `@ghostry/harness` never does.

## `@ghostry/fabricator/internal`

Another entry point — deliberately _not_ re-exported from `.` — for adapter authors who need to dispatch on a primitive kind's structural shape directly (`Kind`, `Meta`, `Buildable`, `Fabrication`, and each kind's own `Core` type). If you're writing an adapter like the TypeBox one, this is where its dispatch tables come from; ordinary schema authoring never needs it.
