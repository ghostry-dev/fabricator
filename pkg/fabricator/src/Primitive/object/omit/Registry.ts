import { subset } from "../Registry";
import type { Schema } from "../Schema";
import type { DefinitionOf, Subsettable } from "../Types";

/**
 * `T.omit(source, keys)`: an `object` Schema without `keys`. `T.pick`'s
 * inverse, and not a kind either — see `subset` in `object/Registry.ts`.
 */
export default function omit<
  $Source extends Subsettable,
  const $Keys extends ReadonlyArray<keyof DefinitionOf<$Source> & string>,
>(
  source: $Source,
  keys: $Keys,
): Schema<Omit<DefinitionOf<$Source>, $Keys[number]>> {
  return subset(source, keys, "omit");
}
