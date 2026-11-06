import { toLengthRange } from "../../Bound";
import type { Produce } from "../../Random/Types";
import { toSchema } from "../../Schema/Core";
import { Kind, Meta } from "../../Types";
import { toRedraws } from "../../Unique/Strategy";
import { Schema } from "./Schema";
import type {
  Fabricated,
  InputUniqueWhereby,
  Key,
  UniqueWhereby,
  Value,
  Whereby,
} from "./Types";

type ThisRegistry<$Key extends Key, $Value extends Value> = {
  /**
   * A record of `value` keyed by `key`, attempted `whereby.size` times —
   * uniformly across `[size.minTried, size.max]` (with `minTried` defaulting to
   * 0). Colliding keys collapse, so the result holds _at most_ that many
   * entries; see `Types.ts`'s `Whereby`.
   */
  whereby: (whereby: Whereby) => Schema<$Key, $Value>;

  /**
   * A record whose production is `produce`, in full, instead of drawn entry by
   * entry.
   */
  as: (produce: Produce<Fabricated<$Key, $Value>>) => Schema<$Key, $Value>;
};

export default function <const $Key extends Key, const $Value extends Value>(
  key: $Key,
  value: $Value,
): ThisRegistry<$Key, $Value> {
  /**
   * Normalized at the _value_ level only (strips methods/`fabricate` so what's
   * actually stored is inert) — the `Schema<...>` return types below are
   * annotated from the original, precise type parameters directly, not
   * re-inferred through `toSchema`'s own generics, which would widen them to
   * `Key`/`Value`'s broad constraints.
   */
  const normalizedKey = toSchema(key) as $Key;
  const normalizedValue = toSchema(value) as $Value;

  return {
    whereby: (whereby: Whereby): Schema<$Key, $Value> =>
      Schema({
        [Kind]: "record",
        [Meta]: { whereby, key: normalizedKey, value: normalizedValue },
      }),

    as: (produce: Produce<Fabricated<$Key, $Value>>): Schema<$Key, $Value> =>
      Schema({
        [Kind]: "record",
        [Meta]: { produce, key: normalizedKey, value: normalizedValue },
      }),
  };
}

type UniqueRegistry<$Key extends Key, $Value extends Value> = {
  /**
   * A record of `value` keyed by `key`, with `size` drawn from a bare `N` or `{
   * min?, max, distribution? }` and every key distinct, so the record holds
   * exactly the size drawn. A key drawn from a finite set (`T.enum`,
   * `T.always`, …) is drawn without replacement, and a `size` that could exceed
   * that set is rejected here, at construction. Any other key is redrawn while
   * it repeats one already in the record, up to `redraws` times in a row.
   */
  whereby: (whereby: InputUniqueWhereby) => Schema<$Key, $Value>;
};

/**
 * `T.unique.record`, assembled into the namespace by `Primitive/unique`. No
 * `as`: a producer replaces the draw, so it would discard the one thing this
 * builder adds.
 */
export function unique<const $Key extends Key, const $Value extends Value>(
  key: $Key,
  value: $Value,
): UniqueRegistry<$Key, $Value> {
  /** See the default export on why only the values are normalized. */
  const normalizedKey = toSchema(key) as $Key;
  const normalizedValue = toSchema(value) as $Value;

  return {
    whereby: (whereby: InputUniqueWhereby): Schema<$Key, $Value> =>
      Schema({
        [Kind]: "record",
        [Meta]: {
          whereby: toUniqueWhereby(whereby),
          unique: true,
          key: normalizedKey,
          value: normalizedValue,
        },
      }),
  };
}

function toUniqueWhereby(input: InputUniqueWhereby): UniqueWhereby {
  const label = "T.unique.record.whereby";
  const size = toLengthRange(input.size, label);
  const redraws = toRedraws(label, input.redraws);
  return redraws === undefined ? { size } : { size, redraws };
}
