import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import type { Core, Fabricated, Items } from "./Types";

/**
 * The buildable recipe for an `enum`: a weighted set of member values, one of
 * which is drawn each fabrication. There is no bare form — see `Registry.ts`'s
 * `uniform`/`weighted`, the only way to reach this Schema.
 */
export interface Schema<
  $Items extends Items = Items,
  $Adaptations extends Adaptations = {},
> extends Core<$Items, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `items` forward, not discarding it, so a later `.as(...)` (or future
   * validation of `produce`) still has it to check against.
   */
  as: (produce: Produce<Fabricated<$Items>>) => Schema<$Items, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$Items, $Adaptations>>) => $Returnable,
  ) => Schema<
    $Items,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $Items extends Items,
  $Adaptations extends Adaptations = {},
>(schema: Core<$Items, $Adaptations>): Schema<$Items, $Adaptations> {
  return {
    ...schema,
    [Kind]: "enum",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
