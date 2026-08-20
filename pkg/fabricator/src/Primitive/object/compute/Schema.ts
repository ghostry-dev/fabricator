import { withAdaptations, type AdaptationEntry } from "../../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../../Adapter/Types";
import type { AnySchema } from "../../../Schema/Types";
import { Kind } from "../../../Types";
import type * as object from "../Types";
import type { Core, Resolved, Source } from "./Types";

export type Computer<$Definition extends object.Definition> = <
  const $Source extends Source,
>(
  source: $Source,
) => {
  as: (
    resolve: (params: {
      fabricated: object.Fabricated<$Definition>;
    }) => NoInfer<Resolved<$Source>>,
  ) => Schema<object.Fabricated<$Definition>, $Source>;
};

export interface Schema<
  $Fabricated,
  $Source extends Source,
  $Adaptations extends Adaptations = {},
> extends Core<$Fabricated, $Source, $Adaptations> {
  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract. Adapting the
   * computed field itself, rather than the `source` it derives its shape from,
   * is the way to say the two differ.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (
      adapting: Adapting<Schema<$Fabricated, $Source, $Adaptations>>,
    ) => $Returnable,
  ) => Schema<
    $Fabricated,
    $Source,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $Fabricated,
  $Source extends Source,
  $Adaptations extends Adaptations = {},
>(
  schema: Core<$Fabricated, $Source, $Adaptations>,
): Schema<$Fabricated, $Source, $Adaptations> {
  return {
    ...schema,
    [Kind]: "object.compute",
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}

export function isObjectComputeSchema(
  candidate: AnySchema,
): candidate is Schema<unknown, Source> {
  return candidate[Kind] === "object.compute";
}
