import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { ProduceContext } from "../../Random/Types";
import { Kind } from "../../Types";
import type * as tuple from "../tuple/Types";
import type { Core, From, Resolved, Source } from "./Types";

/**
 * What `T.derive({ to, from })` returns: not yet a Schema — `.as(resolve)` is
 * what produces one, matching `compute(source).as(resolve)`. There is no
 * re-`.as()` on the Schema; the resolver fully determines production.
 */
export type Deriver<$From extends From, $To extends Source> = {
  /**
   * Supply the function that turns `from`'s fabricated values into the result
   * `to` names. `values` is the positional tuple of those values; `context` is
   * this node's own `{ random, clock }`, so any extra draw still replays under
   * a salt.
   */
  as: (
    resolve: (
      values: tuple.Fabricated<$From>,
      context: ProduceContext,
    ) => NoInfer<Resolved<$To>>,
  ) => Schema<$From, $To>;
};

/**
 * Buildable `derive` recipe: a value computed from other schemas' fabricated
 * output. `from` is fabricated independently (one Fabricator per slot, like
 * `tuple`); `to` declares only the result's type and shape. See `Fabricator.ts`
 * for the mismatch check against `to`.
 */
export interface Schema<
  $From extends From = From,
  $To extends Source = Source,
  $Adaptations extends Adaptations = {},
> extends Core<$From, $To, $Adaptations> {
  /**
   * Override what this schema maps to in one or more external schema libraries
   * — see `string/Schema.ts`'s `adapt` for the full contract. An unadapted
   * derive maps to whatever `to` maps to, honoring any adaptation already on
   * `to`. Adapting the derive itself overrides that, which is how to say the
   * derive's mapping differs from `to`'s.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (
      adapting: Adapting<Schema<$From, $To, $Adaptations>>,
    ) => $Returnable,
  ) => Schema<
    $From,
    $To,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<
  $From extends From,
  $To extends Source,
  $Adaptations extends Adaptations = {},
>(schema: Core<$From, $To, $Adaptations>): Schema<$From, $To, $Adaptations> {
  return {
    ...schema,
    [Kind]: "derive",
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
