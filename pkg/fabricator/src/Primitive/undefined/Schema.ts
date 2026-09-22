import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import {
  schemaSatisfies as satisfies,
  type SatisfiesThis,
} from "../../Schema/Satisfies";
import { Kind } from "../../Types";
import type { Core, Fabricated, Meta as ThisMeta } from "./Types";

/**
 * Nothing to configure (see `Types.ts`'s `Meta`), so `adapt` is this kind's
 * only mapping method — an external library that spells "undefined" differently
 * still needs a way to say so.
 */
export interface Schema<$Adaptations extends Adaptations = {}> extends Core<
  ThisMeta,
  $Adaptations
> {
  /**
   * Check that this schema's fabricated value type is assignable to `$Target`.
   * Identity at runtime; the target is not carried into later chained calls —
   * see `object/Schema.ts`'s `satisfies`.
   */
  satisfies<$Target>(
    this: this & SatisfiesThis<Fabricated, $Target>,
  ): Schema<$Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract.
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
    satisfies,
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
