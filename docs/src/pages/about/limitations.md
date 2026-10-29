# Limitations

## No validation

Fabricator doesn't validate data against a schema. Its own output doesn't need it, since fabricated data always has the right shape. To validate other data at runtime, convert the schema to [TypeBox](/guides/typebox) and validate there.

## No uniqueness guarantee

Nothing in fabricator guarantees unique values. Not across array elements, not across an object's fields, and not across `T.record`'s keys, which are drawn independently and collapse into fewer entries when they collide (see [`T.record`](/reference/primitives/record)). If you need unique values, generate a larger pool than you need and dedupe it yourself, or use `T.number.integer.sequence` for a counter.

## `T.string.uuid` doesn't exist

There's no built-in UUID primitive. Use this instead:

```ts
T.string.as(() => crypto.randomUUID(), { format: "uuid" });
```

This field is not reproducible. `.as(produce)` itself is fine: its producer receives the same `{ random, clock }` context as `T.opaque`'s. But `crypto.randomUUID()` ignores that and uses its own randomness. A producer that draws from `random` replays like anything else. See [`T.opaque`](/reference/primitives/opaque), or use the [faker extension](/guides/faker)'s `T.faker.string.uuid()`, which is reproducible and has the same `format` hint.

## Schema adaptation is one-way (for now)

An adapter converts a fabricator Schema _outward_: `toTypeBox(ProductSchema)` gives you a TypeBox schema. There is no reverse. Nothing turns an existing TypeBox, Zod, or JSON Schema definition into a fabricator Schema, and nothing fabricates data from one directly.

This follows from how adapters work, not from a missing feature. An `Adapter` is `{ key, convert }`, and `convert` handles _fabricator's_ primitive kinds (see [`@ghostry/fabricator/adapting`](/reference/api#ghostryfabricatoradapting)). It can read a fabricator Schema and nothing else. `.adapt(adapter, produce)` works in the same direction: it changes what a schema converts _to_, never what it can be built _from_.

So fabricator has to own the shape definition. If your schemas already exist in another library and you want test data from them without redefining anything, that isn't supported yet, though it likely will be eventually.

Conversion isn't always exact in the forward direction either. `T.opaque` becomes `Type.Unknown()`, a symbol-keyed `T.record` throws instead of producing a schema nothing can pass, and `Static<ToTypeBox<S>>` can differ from the fabricated value's type. See [that section of the TypeBox guide](/guides/typebox#where-statictotypeboxs-and-the-fabricated-value-type-can-legitimately-diverge) for when and why.

## TypeBox version support

Only `@sinclair/typebox` 0.34.x, the scoped package, has an adapter. It is likely frozen. The unscoped `typebox` 1.x package is a separate rewrite, not a continuation, and would need its own adapter. Several things the current adapter maps to (`Type.Date`, `Type.Const`, `Type.Uint8Array`, `Type.Recursive`) don't exist in 1.x. The two adapters could coexist: each adapter carries its own key, so one schema can hold an override for each.

## Not cryptographically secure

Fabricated data is predictable by design and is not safe to use as a secret. See [Security](/about/security).
