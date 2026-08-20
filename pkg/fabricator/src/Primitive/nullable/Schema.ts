import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import { assertDrawableKeyedWeights } from "../../Distribution";
import type { Produce } from "../../Random/Types";
import type { AnySchema } from "../../Schema/Types";
import { Kind, Meta } from "../../Types";
import { outcomes } from "./Outcomes";
import type { Core, Definition, Fabricated, Weights } from "./Types";

/**
 * The buildable recipe for a `nullable`: a single wrapped Schema, drawn (or
 * not) each fabrication.
 */
export interface Schema<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> extends Core<$Definition, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `definition` forward, not discarding it, so a later `.as(...)` (or future
   * validation of `produce`) still has it to check against. `produce` may
   * return `null`, so custom logic composes the same way the built-in roll
   * does.
   */
  as: (
    produce: Produce<Fabricated<$Definition>>,
  ) => Schema<$Definition, $Adaptations>;
  /**
   * Reweight the built-in 50/50 roll. Keys are optional — an omitted key keeps
   * baseline weight `1`, the same weight the 50/50 split already uses — but
   * that baseline is still relative to whatever else is specified, so
   * `.weighted({ null: 0.1 })` shifts both outcomes' shares, not just `null`'s
   * (see `Types.ts`'s `Weights`). Chaining `.weighted(...)` merges into
   * previous weights rather than replacing them, the same layering `.as(...)`
   * uses for `produce`.
   */
  weighted: (weights: Weights) => Schema<$Definition, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract.
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
    [Kind]: "nullable",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    weighted: (weights) => {
      const merged = { ...schema[Meta].weights, ...weights };
      assertDrawableKeyedWeights("T.nullable.weighted", outcomes, merged);

      return Schema({
        ...schema,
        [Meta]: { ...schema[Meta], weights: merged },
      });
    },
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}

export function isNullableSchema(candidate: AnySchema): candidate is Schema {
  return candidate[Kind] === "nullable";
}
