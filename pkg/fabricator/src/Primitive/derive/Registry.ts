import { toSchema } from "../../Schema/Core";
import { Kind, Meta } from "../../Types";
import { Schema, type Deriver } from "./Schema";
import type { From, Source } from "./Types";

export default function <const $From extends From, const $To extends Source>({
  to,
  from,
}: {
  to: $To;
  from: $From;
}): Deriver<$From, $To> {
  /**
   * `.map()` itself only returns `Array<...>`, not the tuple-preserving `$From`
   * — the `as unknown as $From` hop is safe because the runtime shape (one
   * normalized schema per input position, same order) already matches it
   * exactly; only `.map()`'s own generic signature is too loose to say so (same
   * trick `tuple/Registry.ts` and `choice/Registry.ts`'s `weighted` use).
   */
  const normalized = from.map((item) => toSchema(item)) as unknown as $From;

  return {
    as: (resolve): Schema<$From, $To> =>
      Schema({ [Kind]: "derive", [Meta]: { from: normalized, to, resolve } }),
  };
}
