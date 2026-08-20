import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import { Kind } from "../../Types";
import type { Core, Value } from "./Types";

/**
 * A fixed value, so unlike every other kind there is no `.as()` — nothing left
 * to override about producing it. `adapt` still applies: what a value _means_
 * to an external schema library is a separate question from what it fabricates
 * to, and for a value TypeBox cannot pin exactly (a `symbol`, or any value's
 * _static_ type — see `Adapter/TypeBox`'s `toConst`) it is the only way to
 * close the gap.
 */
export interface Schema<
  $Value extends Value = Value,
  $Adaptations extends Adaptations = {},
> extends Core<$Value, $Adaptations> {
  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$Value, $Adaptations>>) => $Returnable,
  ) => Schema<
    $Value,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $Value extends Value,
  $Adaptations extends Adaptations = {},
>(schema: Core<$Value, $Adaptations>): Schema<$Value, $Adaptations> {
  return {
    ...schema,
    [Kind]: "always",
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
