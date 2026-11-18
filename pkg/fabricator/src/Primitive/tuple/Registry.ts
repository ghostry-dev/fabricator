import { toSchema } from "../../Schema/Core.ts";
import { Kind, Meta } from "../../Types.ts";
import { Schema } from "./Schema.ts";
import type { Items } from "./Types.ts";

export default function <const $Items extends Items>(
  items: $Items,
): Schema<$Items> {
  /**
   * `.map()` itself only returns `Array<...>`, not the tuple-preserving
   * `$Items` — the `as unknown as $Items` hop is safe because the runtime shape
   * (one normalized schema per input position, same order) already matches it
   * exactly; only `.map()`'s own generic signature is too loose to say so (same
   * trick `choice/Registry.ts`'s `weighted` uses).
   */
  const normalized = items.map((item) => toSchema(item)) as unknown as $Items;

  return Schema({ [Kind]: "tuple", [Meta]: { items: normalized } });
}
