<div align="center">

<img src="https://docs.ghostry.dev/fabricator/logo.png" alt="fabricator" width="96" height="96">

# @ghostry/fabricator-extension-faker-v10

**Seeded faker generators for `@ghostry/fabricator`.**

[![npm](https://img.shields.io/badge/npm-ffffff.svg?style=for-the-badge&color=000000&logo=npm&logoColor=CB3837)](https://www.npmjs.com/package/@ghostry/fabricator-extension-faker-v10)
[![npmx](https://img.shields.io/badge/npmx-ffffff.svg?style=for-the-badge&color=000000&logo=data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNTMiIGhlaWdodD0iMTUzIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxNTMgMTUzIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxNi43MDQgOS45ODI3KSI+CiAgICA8cGF0aCBkPSJtMC45MzQ3NiA5Ny4yMDVoMjQuMDgxdjIzLjY5M2gtMjQuMDgxeiIgZmlsbD0iI2ZmZiI+PC9wYXRoPgogICAgPHBhdGggZD0ibTEwMy4xMi05LjIzMDctMy42MjExIDEwLjI0Ni00Ni4zMDkgMTMxLTMuNjIxMSAxMC4yNDZoMTUuNTM3bDMuNjIxMS0xMC4yNDYgMTEuNzE3LTMzLjE0OCAzOC4yMTEtMTA4LjF6IiBmaWxsPSIjNTFjOGZjIj48L3BhdGg+CiAgPC9nPgo8L3N2Zz4K&logoColor=51C8FC)](https://npmx.dev/package/@ghostry/fabricator-extension-faker-v10)
[![jsr](https://img.shields.io/badge/jsr-ffffff?style=for-the-badge&color=000000&logo=jsr&logoColor=F7DF1E)](https://jsr.io/@ghostry/fabricator-extension-faker-v10)
[![github](https://img.shields.io/badge/github-ffffff?style=for-the-badge&color=000000&logo=github&logoColor=ffffff)](https://github.com/ghostry-dev/fabricator)
[![typescript](https://img.shields.io/badge/typescript-ffffff?style=for-the-badge&color=000000&logo=typescript&logoColor=3178C6)](#)
[![bun](https://img.shields.io/badge/bun-ffffff?style=for-the-badge&color=000000&logo=bun&logoColor=FBF0DF)](#)
[![node](https://img.shields.io/badge/node-ffffff?style=for-the-badge&color=000000&logo=nodedotjs&logoColor=5FA04E)](#)

</div>

[`@faker-js/faker`](https://fakerjs.dev) integration for [`@ghostry/fabricator`](https://www.npmjs.com/package/@ghostry/fabricator). Faker's generators draw from the same stream as every other builder in a schema, so `T.faker.person.fullName()` replays exactly like `T.string` does — nothing additional to track, no drift between runs.

Targets `@faker-js/faker` 10.x specifically — hence the `-v10` suffix, matching the adapter packages' convention. A future faker major is a sibling package with its own peer range, not a version bump of this one.

## Install

```bash
npm install @ghostry/fabricator-extension-faker-v10 @ghostry/fabricator @faker-js/faker
```

`@ghostry/fabricator` and `@faker-js/faker` are peer dependencies — bring your own.

## Example

`fakerExtension` returns a `registry.extend` callback, so faker's builders arrive as `T.faker.*` on an ordinary extended registry, alongside every core kind:

```ts
import { en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";

const { T, Fabricator } = initialize({
  types: registry.extend(fakerExtension({ locale: en })),
});

const UserSchema = T.object({
  name: T.faker.person.fullName(),
  email: T.faker.internet.email(),
  joined: T.faker.date.past(),
  id: T.string.whereby({ length: { max: 8 } }),
});

new Fabricator(UserSchema).fabricate();
```

`locale` takes faker's own locale definitions rather than a locale name, exactly as `new Faker({ locale })` does — importing the ones you use keeps the rest out of your bundle.

Faker's relative-date methods resolve against the same instance `clock` that `T.date.past`/`T.date.future` do — the two never disagree about what "now" is within one schema.

## Every builder is a real kind, never `opaque`

A faker method could have been wrapped as an opaque producer, and that is the one thing this package refuses to do — an `opaque` schema converts to `Type.Unknown()` in any adapter and is invisible to `combinatorial`/`coverage`. Each builder instead returns the core kind matching the method's own return type:

| faker returns       | builder returns         | via the TypeBox adapter           |
| ------------------- | ----------------------- | --------------------------------- |
| `string` (207)      | `T.string`              | `Type.String()`                   |
| `Date` (7)          | `T.date`                | `Type.Date()`                     |
| a record shape (7)  | `T.object({ ... })`     | `Type.Object({ ... })`            |
| a literal union (6) | `T.enum.uniform([...])` | `Type.Union([Type.Literal(), …])` |
| `number` (6)        | `T.number`              | `Type.Number()`                   |
| `boolean` (1)       | `T.boolean`             | `Type.Boolean()`                  |
| `bigint` (1)        | `T.bigint`              | `Type.BigInt()`                   |
| `number[]` (1)      | `T.array(T.number)`     | `Type.Array(Type.Number())`       |
| `Date[]` (1)        | `T.array(T.date)`       | `Type.Array(Type.Date())`         |

Seventeen string methods whose output satisfies a JSON-Schema format regardless of the options passed additionally carry it — `internet.email()` converts to `Type.String({ format: "email" })`, `database.mongodbObjectId()` to a `pattern`.

The kind table is generated by probing a real `Faker`, and a compile-time assertion checks every entry's value type against faker's own declared return type — so a faker release that changes one fails `tsc` at that entry rather than silently emitting a wrong schema.

## Three deviations from faker's own API

The mirror is not 1:1, and each departure is what makes the guarantee above possible.

**`helpers` is absent.** It is a utility belt, not a data module, and core already expresses all of it better: `arrayElement` is `T.enum.uniform(...)`, `arrayElements`/`multiple` are `T.array(...).whereby({ length })`, `maybe` is `T.optional`/`T.omittable`, `rangeToNumber` is `T.number.whereby({ min, max })`. Eleven of its eighteen methods are generic and would erase to `unknown`. Reach the two with no core equivalent — `fromRegExp` and `fake` — through `use`, below.

**The seven `color.*` methods whose return type depends on their arguments are split in two.** `color.rgb()` returns a `string` or a `number[]` depending on `options.format`, which no single kind can honestly describe, so each becomes a namespace of two named builders — and there is deliberately no bare `T.faker.color.rgb()`:

```ts
T.faker.color.rgb.text(); // T.string
T.faker.color.rgb.channels(); // T.array(T.number)
T.faker.color.rgb.channels({ includeAlpha: true });
```

The same applies to `cmyk`, `hsl`, `hwb`, `lab`, `lch`, and `colorByCSSColorSpace`. `color`'s other four methods are ordinary builders.

**A method declared as a literal union becomes an `enum`, not a `string`.** `person.sexType()` gives `T.enum.uniform(["female", "generic", "male"])`, so it converts to a union of literals and is enumerable by `combinatorial`/`coverage` rather than an unconstrained string.

## `use` — for what the mirror doesn't cover

`use` hands you the shared, stream-backed `Faker` inside a producer, so anything reached through it still draws from the leaf's own seeded stream. It is a plain namespace of kind-tagged forms — you say what shape comes back, and keep a real kind:

```ts
T.faker.use.string((f) => f.helpers.fromRegExp("[A-Z]{3}-[0-9]{4}"));
T.faker.use.string((f) =>
  f.helpers.fake("{{person.firstName}} {{person.lastName}}"),
);
T.faker.use.number((f) => f.helpers.rangeToNumber({ min: 1, max: 10 }));
T.faker.use.opaque((f) => f.helpers.arrayElement(["free", "pro"] as const));
```

`use.string`, `.number`, `.date`, `.boolean`, and `.bigint` stay adapter-compatible. `use.opaque` is the only way to get an `opaque` schema out of this package — honest, since it is the one case where you have told it nothing about the shape.

## Notes

`faker.seed(...)` is inert here, by design: fabricator's seeding governs, and a second one competing for control of the same output is the bug this package exists to remove. Pass a different `salt` to `initialize()` instead.

A builder called outside `fabricate()` throws `FakerExtensionError.NoActiveScopeError` — there is no active fabrication to draw from. `FakerExtensionError` extends core's `FabricatorError`, so one `catch` still covers both packages.

See the [faker guide](https://docs.ghostry.dev/fabricator/guides/faker) in the docs for the full module list and worked examples.
