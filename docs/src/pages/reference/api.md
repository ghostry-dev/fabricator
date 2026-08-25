# Public API

The package's `.` entry point — small on purpose: every primitive is reached through `T`, not imported directly, and everything here either drives that loop (`initialize`, `registry`), supports it (`Trace`, `RootKind`, `Omitted`, `FabricatorError`, `Stream`, `Attribution`, `Fabrication`, `ValueOf`, `layer`, `Layered`, `Config`, `Overlay`, `Context`, `Stack`), or is the contract an external adapter package implements against (`drive`, `Adapter`, `Adapting`, `Adaptations`, `AdaptationsOf`, `Recurse`, `Adaptation`). See [Mental model](/start/mental-model) for why the split exists.

## `initialize(config?)`

```ts
function initialize(config?: {
  types?: Registry;
  seed?: Seed;
  algorithm?: (seed: string) => () => number;
  attribution?: Attribution;
  limits?: { combinatorial: number };
  clock?: Date | "seeded";
  stack?: Stack;
}): Instance;
```

Mints one isolated instance. `types` defaults to the built-in `registry`; `seed` defaults to empty if omitted (unless `FABRICATOR_SEED` / `SEED` / `RANDOM_SEED` supplies one); `algorithm` defaults to a built-in `sfc32` generator. `limits.combinatorial` caps how many instances `combinatorial(...)` (below) may enumerate before throwing — defaults to `1024`, checked eagerly at `initialize()` time, not on first call. `clock` is what `T.date.past`/`T.date.future` (and any producer reading its `ProduceContext`) resolve "now" against, and the default entropy for the instance: it defaults to the wall-clock instant of this `initialize()` call. Pass a `Date` to pin "now" to a specific instant, or `clock: "seeded"` to derive "now" from the instance seed (an instant drawn across the entire representable `Date` range). See [Reproducibility](/guides/reproducibility) and [Custom types](/guides/custom-types).

`attribution` controls how each `new Fabricator(...)` construction is attributed to the file it was written in — resolved once per construction, not once per field:

- `{ kind: "rooted", root }` expresses every file relative to `root` (an absolute path or a `file://` URL), so the same seed reproduces the same data on a checkout at a different absolute path.
- `{ kind: "call site" }`, the default, is `"rooted"` at the directory of whichever file called `initialize()`.
- `{ kind: "none" }` attributes nothing: every construction, anywhere in the instance, draws its root from one shared counter.

`new Fabricator(schema, { seed })` overrides that per construction, forking entirely away from both the resolved file and the instance's own seed — so that one build reproduces regardless of where it's written or how the instance was seeded, as long as the instance's `clock` also matches (a per-construction seed keeps whichever `clock` the instance it's built from already has — see [What "now" means](/guides/reproducibility#what-now-means)). `new Fabricator(schema, { seed: layer(identity) })` forks the same way but _composes_ `identity` onto the instance's own seed instead of replacing it, so the construction still varies when the instance is reseeded — see [`layer(seed)`](#layerseed) below.

`stack` overrides the ambient carrier backing [`wrap`](#instancewrapoverlay-block), and is almost never worth setting. Left alone, the right one is chosen when the package is imported: every runtime with `node:async_hooks` gets an `AsyncLocalStorage` carrier whose frames survive `await`, and anything else gets a synchronous one. Supply your own — anything satisfying `Stack` — to bring async-capable `wrap` to a runtime that would otherwise fall back, or to force the synchronous carrier deliberately.

`new Fabricator(schema, options)` also accepts every slot of a captured `Trace` — `clock`, `root`, `file`, `path`, `kind`, `ordinal` — so `new Fabricator(schema, built.trace)` replays that node. `root` given means this is a replay (`file` and `ordinal` taken verbatim, including `undefined`). `file` given without `root` pins that file and draws the next ordinal for it. `kind` must match the schema or the constructor throws. A nested node's `path` is the base `make` extends for descendants, so replaying a nested `object` reproduces its subtree. See [Reproducibility](/guides/reproducibility) for the full trade-offs, including the cases that still need the parent (`.refine()` compute fields, `recursive.self`, `.override()` `[Fixed]` fields).

## `Instance`

The shape `initialize()` returns:

- **`T`** — the registry of type builders, `types` (or the default) as passed
- **`Fabricator`** — a constructor: `new Fabricator(schema)` turns a Schema into a live Fabricator
- **`seed`** — this instance's seed, always an array; empty if you didn't supply one (and no env var did)
- **`combinatorial(schema)`** — every combination of every enumerable node in `schema` (every enum member, both sides of an optional field, and so on), as a lazy cartesian product. Throws eagerly, before producing anything, if the count would exceed `limits.combinatorial`.
- **`coverage(schema)`** — the minimum set of instances such that every option of every enumerable node in `schema` appears at least once — count equal to the widest single axis, not the product, with narrower axes cycling to fill it. Unbounded by design: its count can never exceed the schema as written, so unlike `combinatorial` it carries no limit.
- **`fork(overlay?)`** — derives a new, related `Instance`. See [`Instance.fork(overlay?)`](#instanceforkoverlay) below.
- **`wrap(overlay, block)`** — makes a fork ambient for a block of code. See [`Instance.wrap(overlay, block)`](#instancewrapoverlay-block) below.
- **`context`** — the configuration in effect right now. See [`Instance.context`](#instancecontext) below.

Both `combinatorial` and `coverage` return a lazy, re-iterable `Iterable` — safe to iterate more than once, each pass drawing fresh randomness for whatever the enumeration didn't pin.

## `Instance.fork(overlay?)`

```ts
function fork(overlay?: Overlay): Instance;
```

Derives a new `Instance` laid over the one `fork` was called on: whatever `overlay` names overrides, whatever it omits inherits — `seed`, `algorithm`, `attribution`, `types`, `limits`, `clock`, all included. A fork is a full peer of an `initialize()` return value in every respect, including its own `fork`/`wrap`. A captured wall-clock or explicit `Date` is inherited as-is; an inherited `"seeded"` clock re-derives from whichever seed the fork ends up with — see [What "now" means](/guides/reproducibility#what-now-means).

```ts
const base = initialize({ seed: "base" });

const tenant = base.fork({ seed: "tenant-7" });
tenant.seed; // ["tenant-7"] — replaced, the ordinary meaning of `seed`

const layered = base.fork({ seed: layer("tenant-7") });
layered.seed; // ["base", "tenant-7"] — composed instead
```

`attribution` resolves once, at `fork()`'s own call, not deferred to whenever the derived instance first constructs — so a fork inherits its base's already-resolved root even when called from a different file, and `fork({ attribution: { kind: "call site" } })` re-roots at _that_ call specifically. See [Reproducibility](/guides/reproducibility) for the full mechanism, and [`layer(seed)`](#layerseed) below for what composing a seed means.

## `Instance.wrap(overlay, block)`

```ts
function wrap<$Return>(
  overlay: Overlay,
  block: (scope: Instance) => $Return,
): $Return;
```

`fork(overlay)`, made ambient for the extent of `block`: every `new Fabricator(...)`, `combinatorial(...)`, and `coverage(...)` reached while `block` runs — on the instance `wrap` was called on, or any other instance derived from the same root `initialize()` call — resolves against the fork automatically, with nothing threaded through. `block` also receives the fork directly, as `scope`, for explicit use:

```ts
const { T, Fabricator, wrap } = initialize({ seed: "base" });

wrap({ seed: layer("a") }, (scope) => {
  new Fabricator(T.number).fabricate(); // picks up the wrap automatically
  new scope.Fabricator(T.number).fabricate(); // the same source, used explicitly
});
```

A nested `wrap` lays its overlay over whichever `wrap` is _currently_ active, not over the instance it was called on — so `wrap({ seed: layer(...) })` accumulates with nesting depth, while a bare `seed` at any depth still replaces outright.

`block` may be `async`. On any runtime with `node:async_hooks` — Node, Bun, Deno — the ambient frame is carried by `AsyncLocalStorage`, so it survives `await`, and two concurrent `wrap`s never see each other's configuration:

```ts
await wrap({ seed: layer("a") }, async () => {
  await loadFixtures();
  new Fabricator(T.number).fabricate(); // still the wrap's configuration
});
```

Anywhere else — a browser bundle, or an `initialize({ stack })` given a synchronous carrier — a frame cannot outlive the block's first `await`. Rather than let a later build resolve against the base instance unannounced, `wrap` throws `SynchronousStackError` as soon as it sees `block` return a promise. The check is on the block, not on what it does: it fires even if the block only ever touches `scope`, because whether something later reads the ambient frame is not knowable from `wrap`. Keep the block synchronous, or hand `initialize({ stack })` an async-capable carrier.

See [Making a fork ambient: wrap](/guides/reproducibility#making-a-fork-ambient-wrap) for the full walkthrough.

## `Instance.context`

```ts
readonly context: {
  seed: readonly string[];
  algorithm: (seed: string) => () => number;
  attribution: Attribution;
  clock: number;
};
```

The configuration in effect right now: the innermost active `wrap` frame's, or the instance's own outside any `wrap`. A live view, not a snapshot — a `context` reference held onto before a `wrap` still reflects it while active, and reverts once the `wrap` ends. `clock` is always a resolved epoch-millisecond number, even under `"seeded"` — see [What "now" means](/guides/reproducibility#what-now-means).

## `layer(seed)`

```ts
function layer(seed: Seed): Layered;
```

Tags a seed as composing onto whatever base is in effect, rather than replacing it outright — the reading a bare `seed` has everywhere else in this library. Works identically wherever a `seed` is accepted against a base: `Instance.fork`, `Instance.wrap`, and a single `new Fabricator(schema, { seed })` call. See [Composing instead of replacing: layer(...)](/guides/reproducibility#composing-instead-of-replacing-layer) for the full picture.

## `registry`

The default set of type builders, exported so it can be extended via `registry.extend(({ T }) => ({ ... }))` before being passed to `initialize({ types })`. See [Custom types](/guides/custom-types).

## `fabricator.trace`

```ts
readonly trace: Trace;
```

Every built Fabricator records how its stream is derived: the instance seed, the resolved clock this construction resolves "now" against (see [What "now" means](/guides/reproducibility#what-now-means)), `root` (how `file` and `ordinal` were resolved — `"attributed"`, `"unattributed"`, or `"counted"`), the file its construction was attributed to, its structural path within that construction, its kind, and which construction (among those sharing that file) it belongs to. `file` is relative to the instance's `attribution` root (absolute only if the construction falls outside it). Recording is unconditional — a bare `object` or `always` still has a `trace`, so a nested node can be rebuilt with `new Fabricator(schema, node.trace)`. Minting a stream from that trace is still paid only by nodes that draw. See [Reproducibility](/guides/reproducibility).

Three values are not a function of the node's own stream, so replaying the node standalone does not reproduce them: a `.refine()` compute field (throws without the parent object), a `recursive.self` node (throws without the enclosing `T.recursive`), and an `.override()` `[Fixed]` field (replays the drawn value the parent discarded). Replay the parent.

## `RootKind` (type only)

`"attributed" | "counted" | "unattributed"` — how `file` and `ordinal` on a `Trace` were resolved. Recorded so a captured trace is self-describing; `"counted"` is replayed for a node taken from inside a `T.recursive` expansion, not a variant you choose when building.

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

## The adapter contract

`drive`, `Adapter`, `Adapting`, `Adaptations`, `AdaptationsOf`, `Recurse`, and `Adaptation` are what an external adapter package (e.g. [`@ghostry/fabricator-adapter-typebox-v0`](https://www.npmjs.com/package/@ghostry/fabricator-adapter-typebox-v0)) is built from — exported here because an adapter is a separate package this one names and depends on nothing from, not something registered internally. Most schemas built with `T` never touch this surface directly; it matters when writing `.adapt(adapter, produce)` calls or authoring a new adapter:

- **`Adapter<$Key, $Context, $Returnable>`** — the shape an adapter itself is: `{ key, convert }`. `convert` is the per-kind dispatch a conversion entry point (e.g. `toTypeBox`) calls.
- **`drive(schema, adapter, context)`** — walks a schema with an adapter, checking whether each node declared an adaptation for that adapter's `key` before falling back to the adapter's own `convert`.
- **`Adapting<$Schema>`** — `{ schema, meta }`, the parameter type of every kind's `.adapt(adapter, produce)` producer. Exported so a producer written as a named function can name its parameter.
- **`Recurse<$Context, $Returnable>`** — the callback `drive` hands an adapter's `convert` so nested schema nodes (an object field, an array element) get the same adaptation lookup as the root.
- **`Adaptation`** — the well-known symbol a Schema stores its per-adapter overrides under.
- **`Adaptations`** / **`AdaptationsOf<$Schema>`** — the runtime shape of that map, and the type-level read of what a given Schema declared.

See [Adapting to an external schema library](/guides/typebox) for the full walkthrough.

## `@ghostry/fabricator/internal`

A second, separate entry point — deliberately _not_ re-exported from `.` — for adapter authors who need to dispatch on a primitive kind's structural shape directly (`Kind`, `Meta`, `Buildable`, `Fabrication`, and each kind's own `Core` type). If you're writing an adapter like the TypeBox one, this is where its dispatch tables come from; ordinary schema authoring never needs it.
