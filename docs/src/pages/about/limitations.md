# Limitations

## No validation

There's no validation of fabricated data against a schema, and no way to opt out of drawing invalid-shaped data, because none is drawn in the first place. If you need runtime validation, convert to [TypeBox](/guides/typebox) and validate there.

## No uniqueness guarantee

Nowhere in this library is there a mechanism to guarantee generated values are unique — not across array elements, not across a fabricated object's fields, and specifically not across `T.record`'s keys, which are drawn independently and collapse into fewer entries on collision (see [`T.record`](/reference/primitives/record)). If you need uniqueness, generate a wider pool than you need and dedupe yourself, or use `T.number.integer.sequence` for a monotonic counter.

## `T.string.uuid` doesn't exist

There's no built-in UUID primitive. The idiom is:

```ts
T.string.as(() => crypto.randomUUID(), { format: "uuid" });
```

Note this particular field isn't seeded from fabricator's own randomness — not because `.as(produce)` is unseeded (its producer receives the same `{ random, clock }` context `T.opaque`'s does), but because `crypto.randomUUID()` ignores what it was handed and draws from its own source. A producer that consumes `random` replays like anything else. See [`T.opaque`](/reference/primitives/opaque) for the full distinction, or [faker](/guides/faker) for `T.faker.string.uuid()`, which is seeded and carries the same `format` hint.

## Schema adaptation is one-way (for now)

An adapter converts a Fabricator Schema _outward_ — `toTypeBox(ProductSchema)` hands back a TypeBox schema. There is no inverse. Nothing here turns an existing TypeBox (or Zod, or JSON Schema) definition into a Fabricator Schema, and nothing fabricates data from one directly.

That falls out of the contract rather than being an unimplemented feature: an `Adapter` is `{ key, convert }`, and `convert` dispatches on _this_ library's primitive kinds (see [The adapter contract](/reference/api#the-adapter-contract)). It knows how to read a Fabricator Schema and nothing else. `.adapt(adapter, produce)` is the same direction — it overrides what a node converts _to_, never what it could be built _from_.

The practical consequence is that fabricator has to own the shape definition. If the schemas already exist in another library and the goal is test data from them without redefining anything, that is currently unsupported (but likely to be supported in the future).

Conversion isn't always a perfect mirror in the forward direction either. `T.opaque` becomes `Type.Unknown()`, a symbol-keyed `T.record` throws rather than emit a schema nothing can satisfy, and `Static<ToTypeBox<S>>` can legitimately differ from the fabricated value's own type — see [that section of the TypeBox guide](/guides/typebox#where-statictotypeboxs-and-the-fabricated-value-type-can-legitimately-diverge) for when and why.

## TypeBox version support

Only `@sinclair/typebox` (0.34.x, the scoped package, likely frozen going forward) has an adapter. The unscoped `typebox` 1.x package is a separate internal rewrite, not a continuation of the scoped one, and would need an adapter of its own — several of the things the current one maps to (`Type.Date`, `Type.Const`, `Type.Uint8Array`, `Type.Recursive`) no longer exist in 1.x. Nothing blocks the two coexisting: an adapter is a value carrying its own key, so a schema can hold an adaptation for each.
