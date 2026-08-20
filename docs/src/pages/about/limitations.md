# Limitations

Honest expectation-setting for a library at version `0.0.1`.

## `@ghostry/fabricator-adapter-typebox-v0` and `@ghostry/fabricator-extension-faker-v10` aren't published yet

`@ghostry/fabricator` itself is published, at `0.0.1`. The TypeBox adapter and faker extension are both fully implemented and packaged, but neither has shipped a first release, so `bun add` for either does not resolve today. See [Installation](/start/installation).

## No validation

There's no validation of fabricated data against a schema, and no way to opt out of drawing invalid-shaped data, because none is drawn in the first place. If you need runtime validation, convert to [TypeBox](/guides/typebox) and validate there.

## No uniqueness facility

Nowhere in this library is there a mechanism to guarantee generated values are unique — not across array elements, not across a fabricated object's fields, and specifically not across `T.record`'s keys, which are drawn independently and collapse into fewer entries on collision (see [`T.record`](/reference/primitives/record)). If you need uniqueness, generate a wider pool than you need and dedupe yourself, or use `T.number.integer.sequence` for a monotonic counter.

## `T.string.uuid` doesn't exist

There's no built-in UUID primitive. The idiom is:

```ts
T.string.as(() => crypto.randomUUID(), { format: "uuid" });
```

Note this particular field isn't seeded from fabricator's own randomness — not because `.as(produce)` is unseeded (its producer receives the same `{ random, clock }` context `T.opaque`'s does), but because `crypto.randomUUID()` ignores what it was handed and draws from its own source. A producer that consumes `random` replays like anything else. See [`T.opaque`](/reference/primitives/opaque) for the full distinction, or [faker](/guides/faker) for `T.faker.string.uuid()`, which is seeded and carries the same `format` hint.

## TypeBox version support

Only `@sinclair/typebox` (0.34.x, the scoped package, likely frozen going forward) has an adapter. The unscoped `typebox` 1.x package is a separate internal rewrite, not a continuation of the scoped one, and would need an adapter of its own — several of the things the current one maps to (`Type.Date`, `Type.Const`, `Type.Uint8Array`, `Type.Recursive`) no longer exist in 1.x. Nothing blocks the two coexisting: an adapter is a value carrying its own key, so a schema can hold an adaptation for each.

## Similar libraries

- [`@anatine/zod-mock`](https://www.npmjs.com/package/@anatine/zod-mock)
- [`@travelperksl/fabricator`](https://www.npmjs.com/package/@travelperksl/fabricator)
