# @ghostry/fabricator-adapter-typebox-v0

TypeBox adapter for [`@ghostry/fabricator`](https://www.npmjs.com/package/@ghostry/fabricator). Converts any Fabricator Schema to a [TypeBox](https://github.com/sinclairzx81/typebox) schema — useful if you want to validate fabricated data, or reuse the same shape for both test-data generation and runtime validation.

Targets `@sinclair/typebox` (0.34.x) specifically — hence the `-v0` suffix. `@sinclair/typebox` and the unscoped `typebox` package (1.x) are separate, unrelated packages rather than a continuation, so a `typebox` 1.x adapter is a genuinely separate sibling package, not a version bump of this one.

## Install

```bash
npm install @ghostry/fabricator-adapter-typebox-v0 @ghostry/fabricator @sinclair/typebox
```

`@ghostry/fabricator` and `@sinclair/typebox` are peer dependencies — bring your own.

## Example

```ts
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";

const TProduct = toTypeBox(ProductSchema);
```

When the default mapping is wrong for a particular schema, override it:

```ts
import { Type } from "@sinclair/typebox";
import { typebox } from "@ghostry/fabricator-adapter-typebox-v0";

T.string
  .whereby({ length: { max: 254 } })
  .adapt(typebox, () => Type.String({ format: "email" }));
```

See the [TypeBox guide](https://docs.ghostry.dev/fabricator/guides/typebox) in the docs for the full default-mapping table, adaptation semantics, and where `Static<ToTypeBox<S>>` and the fabricated value type can legitimately diverge.
