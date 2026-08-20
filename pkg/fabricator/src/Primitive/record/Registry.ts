import type { Produce } from "../../Random/Types";
import { toSchema } from "../../Schema/Core";
import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, Key, Value, Whereby } from "./Types";

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
