import { subset } from "../Registry";
import type { Schema } from "../Schema";
import type { DefinitionOf, Subsettable } from "../Types";

/**
 * `T.pick(source, keys)`: an `object` Schema with only `keys`, in source order.
 * Not a kind — the result is an ordinary `object` Schema. See `subset` in
 * `object/Registry.ts` for what is kept, hidden, and dropped.
 */
export default function pick<
  $Source extends Subsettable,
  const $Keys extends ReadonlyArray<keyof DefinitionOf<$Source> & string>,
>(
  source: $Source,
  keys: $Keys,
): Schema<Pick<DefinitionOf<$Source>, $Keys[number]>> {
  return subset(source, keys, "pick");
}
