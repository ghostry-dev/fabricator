import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import { assertDrawableKeyedWeights } from "../../Distribution";
import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import { outcomes } from "./Outcomes";
import type { Core, Fabricated, Meta as ThisMeta, Weights } from "./Types";

/**
 * Buildable `boolean` recipe: an even coin flip, a weighted one (`weights`), or
 * opaque production via `as`.
 *
 * `$Meta` is generic (defaulting to the full `Meta` union) so builder return
 * types stay narrow — see `number/Schema.ts`. `$Adaptations` is threaded
 * through every builder method for the same reason — see `string/Schema.ts`'s
 * `adapt`.
 */
export interface Schema<
  $Meta extends ThisMeta = ThisMeta,
  $Adaptations extends Adaptations = {},
> extends Core<$Meta, $Adaptations> {
  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `weights` forward, not discarding it, so a later `.as(...)` (or future
   * validation of `produce`) still has it to check against.
   */
  as: (produce: Produce<Fabricated>) => Schema<$Meta, $Adaptations>;

  weighted: (weights: Weights) => Schema<$Meta, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$Meta, $Adaptations>>) => $Returnable,
  ) => Schema<
    $Meta,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $Meta extends ThisMeta,
  $Adaptations extends Adaptations = {},
>(schema: Core<$Meta, $Adaptations>): Schema<$Meta, $Adaptations> {
  return {
    ...schema,
    [Kind]: "boolean",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
    weighted: (weights) => {
      const merged = { ...schema[Meta].weights, ...weights };
      assertDrawableKeyedWeights("T.boolean.weighted", outcomes, merged);

      return Schema({
        ...schema,
        [Meta]: { ...schema[Meta], weights: merged },
      });
    },
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
