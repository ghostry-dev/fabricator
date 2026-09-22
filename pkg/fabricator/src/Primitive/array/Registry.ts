import { toLengthRange } from "../../Bound";
import type { Produce } from "../../Random/Types";
import { toSchema } from "../../Schema/Core";
import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";
import type { Definition, Fabricated, InputWhereby } from "./Types";

type ThisRegistry<$Definition extends Definition> = {
  /**
   * An array of `definition`, repeated `length` times. `length` is a bare `N`
   * (exactly N) or `{ min?, max, distribution? }`. `min` defaults to inclusive
   * 0, so an empty array is a legitimate outcome when no `min` is given.
   * Exclusive ends use a Bound object. A bare `N` is stored as min = max = N
   * inclusive and carries no distribution. Without `distribution`, the length
   * is drawn uniformly across the inclusive interval; `distribution` shapes
   * that draw the same way it does for `T.number.integer`.
   */
  whereby: (whereby: InputWhereby) => Schema<$Definition>;

  /**
   * An array whose production is `produce`, in full, instead of drawn element
   * by element.
   */
  as: (produce: Produce<Fabricated<$Definition>>) => Schema<$Definition>;
};

export default function <const $Definition extends Definition>(
  definition: $Definition,
): ThisRegistry<$Definition> {
  /**
   * Normalized at the _value_ level only (strips methods/`fabricate` so what's
   * actually stored is inert) — the `Schema<$Definition>` return type below is
   * annotated from the original, precise `$Definition` type parameter directly,
   * not re-inferred through `toSchema`'s own generics, which would widen it to
   * `Definition`'s broad constraint.
   */
  const normalized = toSchema(definition) as $Definition;

  return {
    whereby: (whereby: InputWhereby): Schema<$Definition> =>
      Schema({
        [Kind]: "array",
        [Meta]: {
          whereby: { length: toLengthRange(whereby.length, "T.array.whereby") },
          definition: normalized,
        },
      }),

    as: (produce: Produce<Fabricated<$Definition>>): Schema<$Definition> =>
      Schema({ [Kind]: "array", [Meta]: { produce, definition: normalized } }),
  };
}
