import { withAdaptations, type AdaptationEntry } from "../../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../../Adapter/Types";
import { assertDrawableKeyedWeights } from "../../../Distribution";
import type { Produce } from "../../../Random/Types";
import type { AnySchema } from "../../../Schema/Types";
import { Kind, Meta } from "../../../Types";
import { outcomes } from "./Outcomes";
import type { Core, Definition, Resolved, Weights } from "./Types";

export interface Schema<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> extends Core<$Definition, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `definition` forward, not discarding it, so a later `.as(...)` (or future
   * validation of `produce`) still has it to check against. `produce` may
   * return `undefined` or `Omitted`, so custom logic composes the same way
   * the built-in three-way roll does.
   */
  as: (
    produce: Produce<Resolved<$Definition>>,
  ) => Schema<$Definition, $Adaptations>;
  /**
   * Reweight the built-in three-way roll. Keys are optional — an omitted key
   * keeps baseline weight `1`, the same weight the uniform 1/3 split already
   * uses — but that baseline is still relative to whatever else is specified,
   * so `.weighted({ omitted: 0.1 })` shifts every outcome's share, not just
   * `omitted`'s (see `Types.ts`'s `Weights`). Chaining `.weighted(...)` merges
   * into previous weights rather than replacing them, the same layering
   * `.as(...)` uses for `produce`.
   */
  weighted: (weights: Weights) => Schema<$Definition, $Adaptations>;

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
    [Kind]: "object.optional",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    weighted: (weights) => {
      const merged = { ...schema[Meta].weights, ...weights };
      assertDrawableKeyedWeights("T.optional.weighted", outcomes, merged);

      return Schema({
        ...schema,
        [Meta]: { ...schema[Meta], weights: merged },
      });
    },
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}

export function isObjectOptionalSchema(
  candidate: AnySchema,
): candidate is Schema {
  return candidate[Kind] === "object.optional";
}
