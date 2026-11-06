import { toLengthRange } from "../../Bound";
import type { Produce } from "../../Random/Types";
import { toSchema } from "../../Schema/Core";
import type { Fabricated as FabricatedBy } from "../../Schema/Types";
import { Kind, Meta } from "../../Types";
import { toRedraws } from "../../Unique/Strategy";
import { Schema } from "./Schema";
import type {
  Definition,
  Fabricated,
  InputUniqueWhereby,
  InputWhereby,
  Whereby,
} from "./Types";

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

type UniqueRegistry<$Definition extends Definition> = {
  /**
   * An array of `definition` whose members are distinct within each array,
   * repeated `length` times as `T.array`'s is. A member drawn from a finite set
   * (`T.enum`, `T.boolean`, a uniform integer range, a bigint range) is drawn
   * without replacement, and a `length` that could exceed that set is rejected
   * here, at construction. Any other member is redrawn while it repeats one
   * already in the array, up to `redraws` times in a row.
   *
   * Members compare as plain data: by value, `Date` by time, arrays and plain
   * objects by content. Other objects compare by identity; `.by(...)` says what
   * should be distinct instead.
   */
  whereby: (whereby: InputUniqueWhereby) => Schema<$Definition>;

  /**
   * Make members distinct by `key(member)` rather than by the whole member —
   * `.by((user) => user.email)`.
   *
   * Members are always redrawn while their key repeats, even from a finite set
   * that would otherwise be drawn without replacement. A projection can map
   * different members to one key — `["Ann", "Anne", "Bob"]` by first letter has
   * three members but two keys — so the member set's size says nothing about
   * how many distinct keys exist. There is no capacity check at construction,
   * and running out surfaces as `UniqueRedrawsError` once `redraws` consecutive
   * draws repeat a key.
   */
  by: (key: (element: FabricatedBy<$Definition>) => unknown) => {
    whereby: (whereby: InputUniqueWhereby) => Schema<$Definition>;
  };
};

/**
 * `T.unique.array`, assembled into the namespace by `Primitive/unique`. No
 * `as`: a producer replaces the draw, so it would discard the one thing this
 * builder adds.
 */
export function unique<const $Definition extends Definition>(
  definition: $Definition,
): UniqueRegistry<$Definition> {
  /** See the default export on why only the value is normalized. */
  const normalized = toSchema(definition) as $Definition;

  const whereby =
    (by: ((element: FabricatedBy<$Definition>) => unknown) | undefined) =>
    (input: InputUniqueWhereby): Schema<$Definition> =>
      Schema({
        [Kind]: "array",
        [Meta]: {
          whereby: toUniqueWhereby(input),
          definition: normalized,
          unique: by ? { by } : {},
        },
      });

  return {
    whereby: whereby(undefined),
    by: (key) => ({ whereby: whereby(key) }),
  };
}

function toUniqueWhereby(input: InputUniqueWhereby): Whereby {
  const label = "T.unique.array.whereby";
  const length = toLengthRange(input.length, label);
  const redraws = toRedraws(label, input.redraws);
  return redraws === undefined ? { length } : { length, redraws };
}
