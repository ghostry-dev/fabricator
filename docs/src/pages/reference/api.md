# Public API

The package's main entry point, `.`, is small on purpose and covers _using_ fabricator. You reach every primitive through `T`, not by importing it. The exports fall into these groups:

- **Setup:** `initialize` and `registry`, which give you `T`, `Fabricator`, and the rest of an instance.
- **Supporting values and types:** `Trace`, `Omitted`, `FabricatorError`, `Stream`, `Algorithm`, `sample`, `shuffle`, `Fabricated`, `satisfies`, `SatisfiedBy`, `layer`, `Layered`, `Config`, `Overlay`, `Context`, and `Stack`.
- **Adapting:** `Adapting`, the type of an `.adapt(adapter, produce)` producer's argument.

_Extending_ fabricator has separate entry points: `@ghostry/fabricator/adapting` for writing a schema adapter, `@ghostry/fabricator/harnessing` for integrating with a test runner through `@ghostry/harness`, and `@ghostry/fabricator/internal` for the low-level types an adapter needs.

## `initialize(config?)`

```ts
function initialize(config?: {
  types?: Registry;
  salt?: Salt;
  algorithm?: Algorithm;
  limits?: { combinatorial: number };
  clock?: Date | number | "derived";
  stack?: Stack;
}): Instance;
```

Creates one isolated instance.

- `types` defaults to the built-in `registry`. See [Custom types](/guides/custom-types).
- `salt` defaults to empty, unless `FABRICATOR_SALT` sets one. That variable sets the salt only, not the clock.
- `algorithm` defaults to a built-in `sfc32` generator, which is not cryptographically secure. See [Security](/about/security).
- `limits.combinatorial` is the max that `combinatorial(...)` may produce before it throws. It defaults to `1024` and is checked when you call `initialize()`.
- `clock` is "now" for `T.date.past`, `T.date.future`, and any producer that reads `clock` from its context. It is also what makes runs differ. It defaults to the time of this `initialize()` call. Pass a `Date`, or the same instant as milliseconds since the epoch, to pin "now". A number must be one a `Date` can hold exactly, so a fraction or a value outside the `Date` range throws `InvalidClockError`, and so does an invalid `Date`. Pass `"derived"` to compute "now" from the salt, which can give any date in the representable range. See [Reproducibility](/guides/reproducibility).
- `stack` replaces the carrier behind [`wrap`](#instancewrapoverlay-block), and you will almost never need it. By default, a runtime with `node:async_hooks` gets an `AsyncLocalStorage` carrier that lasts through `await`, and any other runtime gets a synchronous one. Pass your own `Stack` to support async `wrap` blocks on a runtime that would otherwise fall back, or to force the synchronous carrier.

`new Fabricator(schema, options)` accepts every field of a `Trace`: `salt`, `clock`, `path`, `kind`, and `ordinal`. Each one you pass replaces that field and nothing else.

- `{ salt }` replaces the salt for one build. The build still takes the next number from the instance's construction counter and still uses the instance's `clock` (see [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy)). `{ salt: layer(identity) }` adds `identity` to the instance's salt instead of replacing it, so the build still changes when the instance's salt does. See [`layer(salt)`](#layersalt).
- `new Fabricator(schema, built.trace)` replays that node. A given `ordinal`, including the `null` that `combinatorial`/`coverage` builds record, is used as-is and doesn't advance the counter, which is what makes the replay exact. `kind` must match the schema, or the constructor throws. Replaying a nested `object` with its `path` reproduces everything under it.

Some values still need their parent to replay: `.refine()` compute fields, `recursive.self`, and `.override()` fields. See [Reproducibility](/guides/reproducibility#trace).

## `Instance`

The shape `initialize()` returns:

- **`T`**: the type builders, from `types` or the default registry.
- **`Fabricator`**: a constructor. `new Fabricator(schema)` turns a Schema into a Fabricator.
- **`salt`**: this instance's salt, always an array. It is empty if neither you nor `FABRICATOR_SALT` set one.
- **`combinatorial(schema)`**: every combination of every enumerable part of `schema` (each enum member, both outcomes of an optional field, and so on). It throws before producing anything if the count would exceed `limits.combinatorial`.
- **`coverage(schema)`**: the smallest set of values in which every option of every enumerable part of `schema` appears at least once. Its size is the widest single axis, not the product, and narrower axes repeat to fill it. It has no limit, because its size can't exceed what the schema already contains.
- **`fork(overlay?)`**: creates a related `Instance`. This is the usual way to change configuration. See [`Instance.fork(overlay?)`](#instanceforkoverlay).
- **`wrap(overlay, block)`**: applies a fork automatically for a block of code, for when you can't pass the scope to the code that needs it. See [`Instance.wrap(overlay, block)`](#instancewrapoverlay-block).
- **`root`**: the first instance in this instance's lineage. See [`Instance.root`](#instanceroot).
- **`context`**: the configuration in effect right now. See [`Instance.context`](#instancecontext).
- **`ancestry`**: this instance's position in its lineage, as an opaque chain of tokens. It is there so you can reason about which wraps apply to an instance. To check "same lineage?", compare `root` instead.

`combinatorial` and `coverage` both return a lazy `Iterable` you can iterate more than once. Each pass draws fresh randomness for anything the enumeration didn't pin.

## `Instance.fork(overlay?)`

```ts
function fork(overlay?: Overlay): Instance;
```

The usual way to change configuration, and the one to use before `wrap`. A fork is a value, so a call through it always uses its configuration, whatever else is going on around the call.

`fork` creates a new `Instance` based on the one it is called on. Whatever `overlay` sets overrides the base, and whatever it leaves out is inherited, including `salt`, `algorithm`, `types`, `limits`, and `clock`. A fork can do everything an `initialize()` result can, including its own `fork` and `wrap`. A wall-clock, `Date`, or number clock is inherited as-is. An inherited `"derived"` clock is derived again from the fork's salt. See [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy).

```ts
const base = initialize({ salt: "base" });

const A = base.fork({ salt: "A" });
A.salt; // ["A"] — replaced, the ordinary meaning of `salt`

const B = base.fork({ salt: layer("B") });
B.salt; // ["base", "B"] — composed instead
```

## `Instance.wrap(overlay, block)`

```ts
function wrap<$Return>(
  overlay: Overlay,
  block: (scope: Instance) => $Return,
): $Return;
```

Use [`fork`](#instanceforkoverlay) unless you can't get the scope to the code that needs it: a callback you don't own, a deep call stack, or code already written against a destructured `Fabricator`. Inside a `wrap`, the object you call through no longer tells you which configuration a call uses. That is exactly what `wrap` is for, and why it isn't the default choice.

`wrap` is `fork(overlay)` applied automatically while `block` runs. Every `new Fabricator(...)`, `combinatorial(...)`, and `coverage(...)` call on the instance `wrap` was called on, or on its ancestors, uses the fork without you passing anything. `block` also receives the fork as `scope`, for explicit use:

```ts
const { T, Fabricator, wrap } = initialize({ salt: "base" });

wrap({ salt: layer("a") }, (scope) => {
  new Fabricator(T.number).fabricate(); // picks up the wrap automatically
  new scope.Fabricator(T.number).fabricate(); // the same source, used explicitly
});
```

A `wrap` builds on the instance it was called on, just like `fork`, whether or not another `wrap` is already open. So a nested `wrap` called through the enclosing `scope` adds to it, and one called through an instance from outside the block starts over. A destructured `wrap` is always from outside:

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

To add to whatever is in effect when you don't have the enclosing `scope`, call through [`context.scope()`](#instancecontext). A plain `salt` without `layer` replaces the salt either way.

A `wrap` applies to calls on the instance it was called on and that instance's ancestors. It never applies to a descendant (a fork of that instance, or the wrap's own `scope`), a sibling, or a different `initialize()`. See [Ambience governs the receiver and its ancestors](/guides/reproducibility#ambience-governs-the-receiver-and-its-ancestors).

`block` can be `async`. On any runtime with `node:async_hooks` (Node, Bun, and Deno), the wrap is carried by `AsyncLocalStorage`, so it lasts through `await`, and two `wrap`s running at once never see each other's configuration:

```ts
await wrap({ salt: layer("a") }, async () => {
  await loadFixtures();
  new Fabricator(T.number).fabricate(); // still the wrap's configuration
});
```

Anywhere else, such as a browser bundle or an `initialize({ stack })` with a synchronous carrier, the wrap ends at the block's first `await`. Instead of letting a later build silently use the base instance, `wrap` throws `SynchronousStackError` as soon as `block` returns a promise. It throws even if the block only uses `scope`, because `wrap` can't know whether later code will rely on the wrap. Keep the block synchronous, or pass `initialize({ stack })` a carrier that supports async.

See [When you cannot thread the scope: wrap](/guides/reproducibility#when-you-cannot-thread-the-scope-wrap) for the full guide, including why `fork` is the better default.

## `Instance.root`

```ts
readonly root: Instance;
```

The first instance in this lineage, the one `initialize()` returned. A root's `root` is itself, so it is never `undefined`.

It is for identity. `a.root === b.root` tells you whether two instances share a lineage. Forks and wraps keep the same root, and two separate `initialize()` calls never share one, even when given the same `stack`:

```ts
const base = initialize({ salt: "base" });
const A = base.fork({ salt: layer("A") });

A.root === base; // true
base.root === base; // true — a root names itself
initialize({ salt: "base" }).root === base; // false
```

It is **not** a way to reach "the active instance". Each instance in a lineage already sees the wraps that apply to it, so there is nothing extra to reach. It is also not the configuration to build with: `root`'s configuration is where the lineage started, not what is in effect now. For that, use [`context.scope()`](#instancecontext).

`root` is typed as `Instance` with a generic registry, so `root.T` is untyped. `root.Fabricator` works normally. A root's registry never changes, since `fork({ types })` creates a new instance and leaves the root alone. But after such a fork, the descendant's type no longer records the root's registry. Keeping it would take a second type parameter on `fork` and `wrap`, which isn't worth it for something meant for identity. To build, use the registry of the instance you have.

[`context.scope()`](#instancecontext) is different: its registry depends on which instance opened the innermost wrap, so it can't be known at compile time at all.

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

The configuration in effect right now: the innermost `wrap` that applies to this instance, or the instance itself if none does. It is a live view, not a snapshot. A `context` you got before a `wrap` reflects the wrap while it is active and goes back afterward. `clock` is always a number of milliseconds since the epoch, even with `"derived"`. See [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy).

`scope()` returns that configuration as an `Instance`: the active wrap's scope, or this instance if there is none. Use it to build on whatever is active from code that holds a different instance:

```ts
const { wrap, context } = initialize({ salt: "base" });

wrap({ salt: layer("a") }, () => {
  context.scope().wrap({ salt: layer("b") }, (inner) => {
    inner.salt; // [...base.salt, "a", "b"]
  });
});
```

Unlike building an overlay from `context.salt` yourself, it also carries over `types`, `limits`, `algorithm`, and `clock`.

`depth` is how many wraps currently apply to this instance, or `0` if none do. A wrap's own `scope` is a descendant of the wrapped instance, so its depth inside that wrap is `0`; the wrap's configuration is already its own. A wrap on a sibling or an ancestor doesn't count.

The four value properties are getters, so **destructure `context` itself, not its properties**. Keeping the object keeps the live view. Pulling a property out, or spreading the object (`{ ...context }`), reads it once and freezes the value:

```ts
const { context } = initialize({ salt: "base" }); // live
const { salt } = instance.context; // a snapshot, taken right now
```

`scope` is the exception, and it is a function for exactly that reason. You build through it rather than read it, so a frozen `scope` wouldn't look out of date. Builds through it would quietly use the wrong base for `wrap` and `fork`. A function looks up the current scope each time you call it, so this stays live:

```ts
const { scope } = instance.context;
wrap({ salt: layer("a") }, () => {
  scope(); // the frame's scope, resolved now — not when it was destructured
});
```

The `Instance` that `scope()` returns is fixed, like any other instance. If you keep that result after the active wrap changes, you get that instance. Keep `scope` itself to stay live.

## `layer(salt)`

```ts
function layer(salt: Salt): Layered;
```

Marks a salt to be added to the salt in effect, instead of replacing it the way a plain `salt` does everywhere else. It works the same in `Instance.fork`, `Instance.wrap`, and `new Fabricator(schema, { salt })`. See [Composing instead of replacing: layer(...)](/guides/reproducibility#composing-instead-of-replacing-layer).

## `sample(list, stream)` / `shuffle(list, stream)`

```ts
function sample<T>(list: ReadonlyArray<T>, stream: Stream): T;
function shuffle<T>(items: ReadonlyArray<T>, stream: Stream): T[];
```

Helpers for a producer that already has a `Stream`, such as `.as(produce)`, `T.opaque`, or a `T.derive` resolver, and needs to pick from a list.

`sample` picks one item uniformly, using one `stream.next()` per call, and doesn't change `list`. An empty list throws `FabricatorError.EmptyItemsError`. `shuffle` returns a new array in random order and doesn't change `items`. An empty list shuffles to an empty list.

Use `T.enum` instead when the pick can be a schema. `coverage`/`combinatorial` can enumerate an enum, but not a pick made inside a producer. See [Drawing inside a producer](/guides/relationships#drawing-inside-a-producer).

## `registry`

The default type builders. It is exported so you can extend it with `registry.extend(({ T }) => ({ ... }))` and pass the result to `initialize({ types })`. See [Custom types](/guides/custom-types).

## `fabricator.trace`

```ts
readonly trace: Trace;
```

Every built Fabricator records where its randomness comes from: the instance salt, the build's "now" (see [The clock is the entropy](/guides/reproducibility#the-clock-is-the-entropy)), its position in the build, its kind, and which build on the instance it belongs to. Every node has a `trace`, even a bare `object` or `always`, so you can rebuild a nested node with `new Fabricator(schema, node.trace)`. See [Reproducibility](/guides/reproducibility#trace).

Some kinds of value don't depend only on the node's own stream, so replaying the node alone doesn't reproduce them. Replay the parent instead:

- a `.refine()` compute field throws without the parent object
- a `recursive.self` node throws without the enclosing `T.recursive`
- an `.override()` field replays the random value the parent threw away

## `Omitted`

A special value. Pass it to `.override(...)` or `.fabricate(overrides)` to force an [omittable](/reference/primitives/omittable) or [optional](/reference/primitives/optional) field to be left out.

## `FabricatorError`

Every error fabricator throws is an instance of this class: a rejected override, a `self` used outside its own `T.recursive` callback, an adaptation that can't be represented, and so on. Each specific error is a subclass on `FabricatorError` itself, such as `FabricatorError.InvalidOverrideValueError`, so one import covers all of them. Check a specific one with `instanceof` or by its `.name`:

```ts
import { FabricatorError } from "@ghostry/fabricator";

try {
  // `name` is a `T.string` field — a number violates its kind
  Product.fabricate({ name: 5 as unknown as string });
} catch (e) {
  if (e instanceof FabricatorError.InvalidOverrideValueError) {
    // this specific failure
  } else if (e instanceof FabricatorError) {
    // any other fabricator failure: e.name, e.message
  }
}
```

## `Stream` (type only)

The type of `random` in a producer's context, for `T.opaque` and every `.as(produce)`. It is exported so you can annotate a producer written as a named function. See [`T.opaque`](/reference/primitives/opaque).

## `Algorithm` (type only)

```ts
type Algorithm = (seed: string) => () => number;
```

The type of `initialize({ algorithm })`: given a seed, returns a generator of floats in `[0, 1)`. See [Bring your own PRNG](/guides/reproducibility#bring-your-own-prng), and [Security](/about/security) for the one case where a generator should ignore its seed.

## `Fabricated<$Schema>` (type only)

Gives the type of value a Schema produces. It works on a Schema before it is built, which helps when a function takes a Schema directly, and on a built Fabricator:

```ts
import type { Fabricated } from "@ghostry/fabricator";

type ProductValue = Fabricated<typeof ProductSchema>;

const Product = new Fabricator(ProductSchema);

type SameProductValue = Fabricated<typeof Product>;
// same as: ReturnType<typeof Product.fabricate>

function seedDb(p: ProductValue) {
  /* ... */
}
```

## `.satisfies<$Target>()`

Checks that a schema produces a value assignable to a type defined somewhere else, such as an API response, a database model, or a generated client. The type still comes from the schema. This is an optional check, not a second definition to keep in sync.

The check is "assignable to", not exact equality, so extra fields pass. The method returns the same schema, unchanged at runtime, so you can call it inline. The check isn't carried forward: a later `.extend` that changes a field's type isn't checked again. Put `.satisfies` last to check the final shape.

You can call it on any schema, at any depth. If a nested field drifts, the error is on that field's line, not on the outer object:

```ts
import { initialize, registry } from "@ghostry/fabricator";
import type { Order, Product } from "./api-client";
// Product = { id: string; price: number }
// Order   = { id: string; product: Product; quantity: number; note?: string }

const { T, Fabricator } = initialize({ types: registry });
const id = T.string.whereby({ length: 8 });

const ProductSchema = T.object({
  id,
  price: T.number.whereby({ min: 1, max: 500 }),
}).satisfies<Product>();

const OrderSchema = T.object({
  id,
  product: T.object({ id, price: id }).satisfies<Product>(),
  //       ~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // the error underlines the schema that is wrong:
  //   "schema produces": { id: string; price: string }
  //   "but target requires": Product
  quantity: T.number.integer.whereby({ min: 1, max: 9 }),
});

const Orders = new Fabricator(OrderSchema);
Orders.fabricate(); // typed exactly as before — `.satisfies` changes nothing at runtime
```

Bare builders are not schemas. `T.string.satisfies<string>()` doesn't exist, but `T.string.whereby({ length: { max: 8 } }).satisfies<string>()` does.

With `exactOptionalPropertyTypes` on, `T.optional` produces `note?: string | undefined` (present, present as `undefined`, or left out), so it does **not** satisfy `note?: string`. `T.omittable` produces `note?: string`, so it does. Either widen the target to `note?: string | undefined` or use `T.omittable`.

### `satisfies<$Target>(buildable)`

There is also a standalone function, for checking anywhere. It only operates at the type level; it does nothing at runtime. It accepts a built Fabricator or a Schema, which is useful when the schema comes from code you don't want to edit:

```ts
import { satisfies } from "@ghostry/fabricator";

const ProductSchema = T.object({
  id,
  price: T.number.whereby({ min: 1, max: 500 }),
});

const ProductFabricator = new Fabricator(ProductSchema);

satisfies<Product>(ProductFabricator);

satisfies<Product>(ProductSchema);
```

If the type doesn't match, it is a type error.

### `SatisfiedBy<$Target, $Buildable>` (type only)

Resolves to `true` when the Schema or built Fabricator produces a value assignable to `$Target`, and otherwise to an object showing both types. Check it with TypeScript's `satisfies` operator, with no helper needed:

```ts
import type { SatisfiedBy } from "@ghostry/fabricator";

true satisfies SatisfiedBy<Product, typeof ProductSchema>;
true satisfies SatisfiedBy<Product, typeof ProductFabricator>;
```

A failure reads `Type 'boolean' does not satisfy the expected type '{ produces: { id: string }; required: Product }'`.

## Calling `.adapt(adapter, produce)`

**`Adapting<$Schema>`** is `{ schema, meta }`, the parameter type of every `.adapt(adapter, produce)` producer. It is exported from `.`, not `./adapting`, despite the similar name, because overriding one schema's mapping is something any user does, not just adapter authors. `meta` is the schema's own config.

```ts
const email = T.string.adapt(typebox, ({ meta }) =>
  Type.String({ format: "email", maxLength: meta.whereby.length.max.value }),
);
```

See [the TypeBox guide](/guides/typebox#when-the-default-is-wrong) for details.

## `@ghostry/fabricator/adapting`

A separate entry point for _writing_ a schema adapter, such as [`@ghostry/fabricator-adapter-typebox-v0`](https://www.npmjs.com/package/@ghostry/fabricator-adapter-typebox-v0). It isn't exported from `.`, because ordinary use never needs it. Fabricator itself doesn't know about or depend on any schema library. Every mapping, and every dependency, belongs to the adapter.

- **`Adapter<$Key, $Context, $Returnable>`**: what an adapter is, `{ key, convert }`. `convert` handles each kind, and a conversion function like `toTypeBox` calls it.
- **`walk(adapter, schema, context)`**: walks a schema with an adapter. At each node, it uses the node's override for that adapter's `key` if there is one, and otherwise calls the adapter's `convert`.
- **`Recurse<$Context, $Returnable>`**: the callback `walk` passes to `convert`, so nested nodes (an object field, an array element) get the same override check as the root.
- **`Adaptation`**: the symbol a Schema stores its per-adapter overrides under. Only adapters read it.
- **`Adaptations`** / **`AdaptationsOf<$Schema>`**: the runtime shape of that map, and the type of what a given Schema declared.

## `@ghostry/fabricator/harnessing`

The entry point [`@ghostry/harness`](https://github.com/ghostry-dev/harness) uses to integrate fabricator. It isn't exported from `.`, because only a test setup module needs it. Neither package depends on the other. The types here are fabricator's own copy of the part of harness's contract it uses. See [Harness](/guides/harness) for setup.

- **`integration(instance)`**: turns an existing instance into a harness integration. It never creates an instance, so your `initialize(...)` call controls the configuration, especially `clock`. Each test body runs inside `context.scope().wrap({ salt: layer(...) }, ...)`, salted from the test's `Identity` as `[kind, ...path, name, row?]`. It never sets a clock. Wrapping the scope in effect, not the instance it was given, is what lets the per-test salt add to an enclosing `wrap`, such as another integration's, instead of replacing it.
- **`Integration<$Context, $Established>`**: `{ name, provides, frame }`, what `integration(...)` returns. `frame` is a generator with one `yield`. The wrapper it yields runs the test body inside it and returns the body's value unchanged.
- **`Identity`**: `{ kind, path, name, row }`. That is `"test"` or `"suite"`, the enclosing `describe` names from outer to inner, the test name (`""` for a suite hook), and the `.each` row index or `undefined`. It doesn't include the file.
- **`Frame<$Established>`** / **`Wrapper<$Established>`**: the generator `frame` returns, and the optional function it yields. `Wrapper` returns the body's value unchanged, which keeps a synchronous test synchronous and lets frames nest.
- **`FrameArgs`** / **`ProviderArgs<$Established>`**: what each hook receives, always as one object: `{ identity }` for `frame`, and the same plus `established` for a provider.
- **`Provider<$Value, $Established>`** / **`Provides<$Context, $Established>`**: one provider per context key. Each receives `{ identity, established }`, where `established` is whatever this integration's wrapper passed along. `provides` is the only place an integration's keys come from.
- **`FabricatorTestContext<$Registry>`**: `{ fabricator }`, the per-test `Instance` a test body receives.

Reading `provides.fabricator` outside the integration's own frame throws `FabricatorError.HarnessingProviderError`. That only happens if something calls the integration incorrectly; `@ghostry/harness` never does.

## `@ghostry/fabricator/internal`

Another entry point, deliberately _not_ exported from `.`, for adapter authors who need to handle each primitive kind by its shape (`Kind`, `Meta`, `Buildable`, `Fabrication`, and each kind's `Core` type). If you're writing an adapter like the TypeBox one, this is what it builds on. Ordinary use never needs it.
