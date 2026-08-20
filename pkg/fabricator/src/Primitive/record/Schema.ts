import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import type { Core, Fabricated, Key, Value } from "./Types";

/**
 * The buildable recipe for a `record`: a key Schema and a value Schema, drawn
 * `whereby.size` times. `array`'s sibling — one repeated value shape and a
 * fuzzed count — but keyed rather than indexed.
 */
export interface Schema<
  $Key extends Key = Key,
  $Value extends Value = Value,
  $Adaptations extends Adaptations = {},
> extends Core<$Key, $Value, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `whereby`/`key`/`value` forward, not discarding them, so a later `.as(...)`
   * (or future validation of `produce`) still has them to check against.
   */
  as: (
    produce: Produce<Fabricated<$Key, $Value>>,
  ) => Schema<$Key, $Value, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt`. Particularly relevant here: a
   * symbol-keyed record has no TypeBox counterpart (`Adapter/TypeBox`'s
   * `record` case), so this is the only way to give one a mapping.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (
      adapting: Adapting<Schema<$Key, $Value, $Adaptations>>,
    ) => $Returnable,
  ) => Schema<
    $Key,
    $Value,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $Key extends Key,
  $Value extends Value,
  $Adaptations extends Adaptations = {},
>(
  schema: Core<$Key, $Value, $Adaptations>,
): Schema<$Key, $Value, $Adaptations> {
  return {
    ...schema,
    [Kind]: "record",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
