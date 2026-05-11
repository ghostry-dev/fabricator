import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import { Kind } from "../../Types";
import type { Core, Meta as ThisMeta } from "./Types";

/**
 * Nothing to configure (see `Types.ts`'s `Meta`), so `adapt` is this kind's
 * only builder method — an external library that spells "undefined"
 * differently still needs a way to say so.
 */
export interface Schema<$Adaptations extends Adaptations = {}> extends Core<
  ThisMeta,
  $Adaptations
> {
  /**
   * Override what this schema maps to in one or more external schema
   * libraries — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$Adaptations>>) => $Returnable,
  ) => Schema<
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<$Adaptations extends Adaptations = {}>(
  schema: Core<ThisMeta, $Adaptations>,
): Schema<$Adaptations> {
  return {
    ...schema,
    [Kind]: "undefined",
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
