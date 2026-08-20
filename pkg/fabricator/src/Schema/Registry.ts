import * as primitives from "../Primitive";
import { deepMerge, type DeepMerge } from "../Utility/DeepMerge";
import { type PlainObject } from "../Utility/Types";

/**
 * `Primitive/index.ts` also exports the kind-module namespace as `Primitive`
 * (`Primitive.boolean.Schema`, …). That is not a builder — omitting it here is
 * what keeps `T.Primitive` from existing.
 */
type Builders = Omit<typeof primitives, "Primitive">;

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

  return { ...registrations, extend };
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

export const registry: Registry<Builders> = Registry({}).extend(() => {
  const { Primitive: _, ...builders } = primitives;
  return builders;
});
