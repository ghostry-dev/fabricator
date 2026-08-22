# fabricator

Fabricate typed data from composable schemas.

## Install

```bash
npm install @ghostry/fabricator
```

Also available via `bun add @ghostry/fabricator` or `bunx jsr add @ghostry/fabricator`.

## Example

```ts
import { initialize } from "@ghostry/fabricator";

const { T, Fabricator } = initialize({ seed: "1234" });

const ProductSchema = T.object({
  name: T.string.whereby({ length: { min: 1, max: 25 } }),
  price: T.number.whereby({ min: 1, max: 500 }),
  inStock: T.boolean,
  createdAt: T.date.past,
  tags: T.array(T.string.whereby({ length: { max: 15 } })).whereby({
    length: { max: 5 },
  }),
});

const Product = new Fabricator(ProductSchema);

const item = Product.fabricate();
// { name: "...", price: ..., inStock: ..., createdAt: ..., tags: [...] }

/**
 * Fabricate with everything random except a few fields you care about.
 */
const widget = Product.fabricate({ name: "Widget", inStock: true });
```

`seed: "1234"` is an optional mixer; `clock` (the wall-clock instant of this call, by default) is the run's entropy. Pass the same seed and clock to replay. See the [docs site](https://ghostry-dev.github.io/fabricator/) for the full guide: the mental model behind Schemas and Fabricators, composing and overriding schemas, custom types, distributions, and the [TypeBox adapter](https://www.npmjs.com/package/@ghostry/fabricator-adapter-typebox-v0).
