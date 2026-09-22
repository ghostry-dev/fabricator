import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import {
  schemaSatisfies as satisfies,
  type SatisfiesThis,
} from "../../Schema/Satisfies";
import { Kind, Meta } from "../../Types";
import type { Core, Fabricated, Items } from "./Types";

/**
 * Buildable `tuple` recipe: a fixed-length list of slot schemas, each
 * fabricated independently — see `Fabricator.ts` for why that independence (one
 * Fabricator per slot, not one reused across slots like `array`'s single
 * element) is the defining difference from `array`.
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
   * Check that this schema's fabricated value type is assignable to `$Target`.
   * Identity at runtime; the target is not carried into later chained calls —
   * see `object/Schema.ts`'s `satisfies`.
   */
  satisfies<$Target>(
    this: this & SatisfiesThis<Fabricated<$Items>, $Target>,
  ): Schema<$Items, $Adaptations>;

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
    [Kind]: "tuple",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    satisfies,
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
