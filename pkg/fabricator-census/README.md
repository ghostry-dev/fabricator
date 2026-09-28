<div align="center">

<img src="https://docs.ghostry.dev/fabricator/logo.png" alt="fabricator" width="96" height="96">

# @ghostry/fabricator-census

**Take a census of real data; get `@ghostry/fabricator` schema suggestions.**

[![npm](https://img.shields.io/badge/npm-ffffff.svg?style=for-the-badge&color=000000&logo=npm&logoColor=CB3837)](https://www.npmjs.com/package/@ghostry/fabricator-census)
[![npmx](https://img.shields.io/badge/npmx-ffffff.svg?style=for-the-badge&color=000000&logo=data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTMiIGhlaWdodD0iMTUzIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxNTMgMTUzIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNi43MDQgOS45ODI3KSI+CiAgICA8cGF0aCBkPSJtMC45MzQ3NiA5Ny4yMDVoMjQuMDgxdjIzLjY5M2gtMjQuMDgxeiIgZmlsbD0iI2ZmZiI+PC9wYXRoPgogICAgPHBhdGggZD0ibTEwMy4xMi05LjIzMDctMy42MjExIDEwLjI0Ni00Ni4zMDkgMTMxLTMuNjIxMSAxMC4yNDZoMTUuNTM3bDMuNjIxMS0xMC4yNDYgMTEuNzE3LTMzLjE0OCAzOC4yMTEtMTA4LjF6IiBmaWxsPSIjNTFjOGZjIj48L3BhdGg+CiAgPC9nPgo8L3N2Zz4K&logoColor=51C8FC)](https://npmx.dev/package/@ghostry/fabricator-census)
[![jsr](https://img.shields.io/badge/jsr-ffffff?style=for-the-badge&color=000000&logo=jsr&logoColor=F7DF1E)](https://jsr.io/@ghostry/fabricator-census)
[![github](https://img.shields.io/badge/github-ffffff?style=for-the-badge&color=000000&logo=github&logoColor=ffffff)](https://github.com/ghostry-dev/fabricator)
[![typescript](https://img.shields.io/badge/typescript-ffffff?style=for-the-badge&color=000000&logo=typescript&logoColor=3178C6)](#)
[![bun](https://img.shields.io/badge/bun-ffffff?style=for-the-badge&color=000000&logo=bun&logoColor=FBF0DF)](#)
[![node](https://img.shields.io/badge/node-ffffff?style=for-the-badge&color=000000&logo=nodedotjs&logoColor=5FA04E)](#)

</div>

A fabricator schema describes structure you already know. Realistic test data also needs the statistical shape of real data — how values are distributed, how often fields are missing or `null`, how long strings run and which characters they contain, which strings are really enums — and that shape is usually guessed. This package takes a census of a sample of real data and reports those statistics in fabricator's own vocabulary: `Distribution` variants, `whereby` ranges, `.weighted(...)` weights and string `composition`.

A companion entry point, `@ghostry/fabricator-census/postgres`, builds the PostgreSQL queries a census is fed from — statistically sized samples, catalog statistics and whole-table aggregates — without ever opening a connection. You run each query with your own driver.

A census keeps what it observed — frequencies, enum members, extremes and quantiles are the source's own values — so treat a census, and any schema written from it, as you would the data it was taken from.

## Install

```bash
npm install @ghostry/fabricator-census @ghostry/fabricator
```

`@ghostry/fabricator` is a peer dependency.
