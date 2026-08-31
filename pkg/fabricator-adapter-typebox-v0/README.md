<div align="center">

<img src="https://docs.ghostry.dev/fabricator/logo.png" alt="fabricator" width="96" height="96">

# @ghostry/fabricator-adapter-typebox-v0

**TypeBox adapter for `@ghostry/fabricator`.**

[![npm](https://img.shields.io/badge/npm-ffffff.svg?style=for-the-badge&color=000000&logo=npm&logoColor=CB3837)](https://www.npmjs.com/package/@ghostry/fabricator-adapter-typebox-v0)
[![npmx](https://img.shields.io/badge/npmx-ffffff.svg?style=for-the-badge&color=000000&logo=data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTMiIGhlaWdodD0iMTUzIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxNTMgMTUzIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNi43MDQgOS45ODI3KSI+CiAgICA8cGF0aCBkPSJtMC45MzQ3NiA5Ny4yMDVoMjQuMDgxdjIzLjY5M2gtMjQuMDgxeiIgZmlsbD0iI2ZmZiI+PC9wYXRoPgogICAgPHBhdGggZD0ibTEwMy4xMi05LjIzMDctMy42MjExIDEwLjI0Ni00Ni4zMDkgMTMxLTMuNjIxMSAxMC4yNDZoMTUuNTM3bDMuNjIxMS0xMC4yNDYgMTEuNzE3LTMzLjE0OCAzOC4yMTEtMTA4LjF6IiBmaWxsPSIjNTFjOGZjIj48L3BhdGg+CiAgPC9nPgo8L3N2Zz4K&logoColor=51C8FC)](https://npmx.dev/package/@ghostry/fabricator-adapter-typebox-v0)
[![jsr](https://img.shields.io/badge/jsr-ffffff?style=for-the-badge&color=000000&logo=jsr&logoColor=F7DF1E)](https://jsr.io/@ghostry/fabricator-adapter-typebox-v0)
[![github](https://img.shields.io/badge/github-ffffff?style=for-the-badge&color=000000&logo=github&logoColor=ffffff)](https://github.com/ghostry-dev/fabricator)
[![typescript](https://img.shields.io/badge/typescript-ffffff?style=for-the-badge&color=000000&logo=typescript&logoColor=3178C6)](#)
[![bun](https://img.shields.io/badge/bun-ffffff?style=for-the-badge&color=000000&logo=bun&logoColor=FBF0DF)](#)
[![node](https://img.shields.io/badge/node-ffffff?style=for-the-badge&color=000000&logo=nodedotjs&logoColor=5FA04E)](#)

</div>

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
