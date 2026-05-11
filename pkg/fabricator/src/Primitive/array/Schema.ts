import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import type { Core, Definition, Fabricated } from "./Types";

/**
 * The buildable recipe for an `array`: a single element Schema, repeated
 * `whereby.length` times.
 */
export interface Schema<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> extends Core<$Definition, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `whereby`/`definition` forward, not discarding them, so a later
   * `.as(...)` (or future validation of `produce`) still has them to check
   * against.
   */
  as: (
    produce: Produce<Fabricated<$Definition>>,
  ) => Schema<$Definition, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema
   * libraries — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (
      adapting: Adapting<Schema<$Definition, $Adaptations>>,
    ) => $Returnable,
  ) => Schema<
    $Definition,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $Definition extends Definition,
  $Adaptations extends Adaptations = {},
>(schema: Core<$Definition, $Adaptations>): Schema<$Definition, $Adaptations> {
  return {
    ...schema,
    [Kind]: "array",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
