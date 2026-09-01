<div align="center">

<img src="docs/public/logo.png" alt="fabricator" width="96" height="96">

# @ghostry/fabricator

**Fabricate typed data from composable schemas.**

Full type inference, seeded reproducibility, and fixtures that don't churn when the schema changes.

[![npm](https://img.shields.io/badge/npm-ffffff.svg?style=for-the-badge&color=000000&logo=npm&logoColor=CB3837)](https://www.npmjs.com/package/@ghostry/fabricator)
[![npmx](https://img.shields.io/badge/npmx-ffffff.svg?style=for-the-badge&color=000000&logo=data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTMiIGhlaWdodD0iMTUzIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxNTMgMTUzIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNi43MDQgOS45ODI3KSI+CiAgICA8cGF0aCBkPSJtMC45MzQ3NiA5Ny4yMDVoMjQuMDgxdjIzLjY5M2gtMjQuMDgxeiIgZmlsbD0iI2ZmZiI+PC9wYXRoPgogICAgPHBhdGggZD0ibTEwMy4xMi05LjIzMDctMy42MjExIDEwLjI0Ni00Ni4zMDkgMTMxLTMuNjIxMSAxMC4yNDZoMTUuNTM3bDMuNjIxMS0xMC4yNDYgMTEuNzE3LTMzLjE0OCAzOC4yMTEtMTA4LjF6IiBmaWxsPSIjNTFjOGZjIj48L3BhdGg+CiAgPC9nPgo8L3N2Zz4K&logoColor=51C8FC)](https://npmx.dev/package/@ghostry/fabricator)
[![jsr](https://img.shields.io/badge/jsr-ffffff?style=for-the-badge&color=000000&logo=jsr&logoColor=F7DF1E)](https://jsr.io/@ghostry/fabricator)
[![github](https://img.shields.io/badge/github-ffffff?style=for-the-badge&color=000000&logo=github&logoColor=ffffff)](https://github.com/ghostry-dev/fabricator)
[![typescript](https://img.shields.io/badge/typescript-ffffff?style=for-the-badge&color=000000&logo=typescript&logoColor=3178C6)](#)
[![bun](https://img.shields.io/badge/bun-ffffff?style=for-the-badge&color=000000&logo=bun&logoColor=FBF0DF)](#)
[![node](https://img.shields.io/badge/node-ffffff?style=for-the-badge&color=000000&logo=nodedotjs&logoColor=5FA04E)](#)

[**Documentation**](https://docs.ghostry.dev/fabricator/) &nbsp;·&nbsp; [**Guides**](https://docs.ghostry.dev/fabricator/guides/composition) &nbsp;·&nbsp; [**API Reference**](https://docs.ghostry.dev/fabricator/reference/api)

</div>

## Packages

This is the monorepo for `fabricator` and its companion packages.

| Package                                                                                   | Version                                                                                                                                                                                                 | Description                                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`@ghostry/fabricator`](pkg/fabricator/README.md)                                         | [![npm version](https://img.shields.io/npm/v/%40ghostry%2Ffabricator?style=flat-square&color=000000&label=)](https://www.npmjs.com/package/@ghostry/fabricator)                                         | The core library.                                                                                    |
| [`@ghostry/fabricator-adapter-typebox-v0`](pkg/fabricator-adapter-typebox-v0/README.md)   | [![npm version](https://img.shields.io/npm/v/%40ghostry%2Ffabricator-adapter-typebox-v0?style=flat-square&color=000000&label=)](https://www.npmjs.com/package/@ghostry/fabricator-adapter-typebox-v0)   | Converts any Fabricator Schema to a [TypeBox v0](https://github.com/sinclairzx81/typebox) schema.    |
| [`@ghostry/fabricator-extension-faker-v10`](pkg/fabricator-extension-faker-v10/README.md) | [![npm version](https://img.shields.io/npm/v/%40ghostry%2Ffabricator-extension-faker-v10?style=flat-square&color=000000&label=)](https://www.npmjs.com/package/@ghostry/fabricator-extension-faker-v10) | [Faker v10](https://fakerjs.dev) generators, seeded through the fabricator instance that calls them. |

## Install

```bash
npm install @ghostry/fabricator
```

## Example

```ts
import { initialize } from "@ghostry/fabricator";

const { T, Fabricator } = initialize();

const ProductSchema = T.object({
  name: T.string.whereby({ length: { min: 1, max: 25 } }),
  price: T.number.whereby({ min: 1, max: 500 }),
  inStock: T.boolean,
});

const Product = new Fabricator(ProductSchema);

const item = Product.fabricate();
// { name: "...", price: ..., inStock: ... }
```

See the [docs site](https://docs.ghostry.dev/fabricator/) for the full guide.

## License

[MIT](LICENSE) © Patrick Rebsch
