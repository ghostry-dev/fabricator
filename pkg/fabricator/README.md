<div align="center">

<img src="https://docs.ghostry.dev/fabricator/logo.png" alt="fabricator" width="96" height="96">

# @ghostry/fabricator

**Fabricate typed data from composable schemas.**

[![npm](https://img.shields.io/badge/npm-ffffff.svg?style=for-the-badge&color=000000&logo=npm&logoColor=CB3837)](https://www.npmjs.com/package/@ghostry/fabricator)
[![npmx](https://img.shields.io/badge/npmx-ffffff.svg?style=for-the-badge&color=000000&logo=data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTMiIGhlaWdodD0iMTUzIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxNTMgMTUzIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNi43MDQgOS45ODI3KSI+CiAgICA8cGF0aCBkPSJtMC45MzQ3NiA5Ny4yMDVoMjQuMDgxdjIzLjY5M2gtMjQuMDgxeiIgZmlsbD0iI2ZmZiI+PC9wYXRoPgogICAgPHBhdGggZD0ibTEwMy4xMi05LjIzMDctMy42MjExIDEwLjI0Ni00Ni4zMDkgMTMxLTMuNjIxMSAxMC4yNDZoMTUuNTM3bDMuNjIxMS0xMC4yNDYgMTEuNzE3LTMzLjE0OCAzOC4yMTEtMTA4LjF6IiBmaWxsPSIjNTFjOGZjIj48L3BhdGg+CiAgPC9nPgo8L3N2Zz4K&logoColor=51C8FC)](https://npmx.dev/package/@ghostry/fabricator)
[![jsr](https://img.shields.io/badge/jsr-ffffff?style=for-the-badge&color=000000&logo=jsr&logoColor=F7DF1E)](https://jsr.io/@ghostry/fabricator)
[![github](https://img.shields.io/badge/github-ffffff?style=for-the-badge&color=000000&logo=github&logoColor=ffffff)](https://github.com/ghostry-dev/fabricator)
[![typescript](https://img.shields.io/badge/typescript-ffffff?style=for-the-badge&color=000000&logo=typescript&logoColor=3178C6)](#)
[![bun](https://img.shields.io/badge/bun-ffffff?style=for-the-badge&color=000000&logo=bun&logoColor=FBF0DF)](#)
[![node](https://img.shields.io/badge/node-ffffff?style=for-the-badge&color=000000&logo=nodedotjs&logoColor=5FA04E)](#)

</div>

## Install

```bash
npm install @ghostry/fabricator
```

## Example

```ts
import { initialize } from "@ghostry/fabricator";

const { T, Fabricator } = initialize({ salt: "1234" });

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

`salt: "1234"` is an optional mixer; `clock` (the wall-clock instant of this call, by default) is the run's entropy. Pass the same salt and clock to replay. See the [docs site](https://docs.ghostry.dev/fabricator/) for the full guide: the mental model behind Schemas and Fabricators, composing and overriding schemas, custom types, distributions, and the [TypeBox adapter](https://www.npmjs.com/package/@ghostry/fabricator-adapter-typebox-v0).
