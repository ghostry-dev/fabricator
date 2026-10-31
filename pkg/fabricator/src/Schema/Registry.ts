import * as primitives from "../Primitive";
import { deepMerge, type DeepMerge } from "../Utility/DeepMerge";
import { type PlainObject } from "../Utility/Types";

/**
 * A kind whose `Registry.ts` default export takes no arguments returns a bare
 * Schema, which `builders` installs behind a getter; every builder takes at
 * least one. A bare kind left without a getter therefore fails to compile in
 * `builders`, where the spread supplies the function itself.
 */
type Builders = {
  [
    $K in Exclude<keyof typeof primitives, "Primitive">
  ]: (typeof primitives)[$K] extends () => infer $Schema
    ? $Schema
    : (typeof primitives)[$K];
};

const Registry = <const $Registry extends PlainObject>(
  registrations: $Registry,
): Registry<$Registry> => {
  const extend = <const $Extension extends PlainObject>(
    types: (params: { T: $Registry; augment: typeof deepMerge }) => $Extension,
  ): Registry<DeepMerge<$Registry, $Extension>> => {
    return Registry(
      deepMerge(registrations, types({ T: registrations, augment: deepMerge })),
    ) as Registry<DeepMerge<$Registry, $Extension>>;
  };

  /**
   * A merge, not `{ ...registrations, extend }`: a spread reads every getter
   * once and copies the result as data, which would pin each registry Schema to
   * a single object. `deepMerge` carries accessors through, and `extend`, a
   * function, replaces any `extend` key wholesale.
   */
  return deepMerge(registrations, { extend }) as Registry<$Registry>;
};

type RegistryInterface<$Registry> = {
  extend: <const $Extension extends PlainObject>(
    types: (params: { T: $Registry; augment: typeof deepMerge }) => $Extension,
  ) => Registry<DeepMerge<$Registry, $Extension>>;
};

export type Registry<$Registry> = {
  [
    $K in keyof $Registry as $K extends keyof RegistryInterface<$Registry>
      ? never
      : $K
  ]: $Registry[$K];
} & RegistryInterface<$Registry>;

/**
 * Every builder, with each registry entry that is itself a Schema behind a
 * getter — the bare-form kinds here, and their nested Schemas (`T.date.past`,
 * `T.number.integer`, …) in their own `Registry.ts`.
 *
 * A Schema is keyed by identity wherever something caches by schema:
 * `fabricate`'s cache, and `@ghostry/extern`'s blocks and mocks, which take a
 * Schema as a block's identity. One shared `T.number` would make every
 * `typed.by(T.number)` in a test a single block — one cached value, one mock.
 * As a getter, each read is its own Schema, and the identity belongs to whoever
 * holds it (`const Age = T.number`).
 *
 * Builders stay plain properties. Calling one already yields a fresh Schema,
 * and `T.string`/`T.bigint` carry `[Kind]` but no `[Meta]`, so neither can be
 * built or used as an identity.
 */
function builders(): Builders {
  /**
   * `Primitive/index.ts` also exports the kind-module namespace as `Primitive`
   * (`Primitive.boolean.Schema`, …). That is not a builder — omitting it here
   * is what keeps `T.Primitive` from existing.
   */
  const { Primitive: _, ...rest } = primitives;

  return {
    ...rest,
    get boolean() {
      return primitives.boolean();
    },
    get date() {
      return primitives.date();
    },
    get null() {
      return primitives.null();
    },
    get number() {
      return primitives.number();
    },
    get symbol() {
      return primitives.symbol();
    },
    get undefined() {
      return primitives.undefined();
    },
  };
}

export const registry: Registry<Builders> = Registry({}).extend(builders);
