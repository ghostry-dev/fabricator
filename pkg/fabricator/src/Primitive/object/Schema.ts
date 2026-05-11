import type { AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { AnySchema } from "../../Schema/Types";
import { Kind, Meta } from "../../Types";
import type { ShallowMerge } from "../../Utility/ShallowMerge";
import type { Computer } from "./compute/Schema";
import type {
  Core,
  Definition,
  Extender,
  Fabricated,
  Override,
  Refinement,
} from "./Types";

export type Refiner<
  $Definition extends Definition,
  $Refinement extends Refinement<$Definition>,
> = (params: {
  base: Schema<$Definition>;
  compute: Computer<$Definition>;
}) => $Refinement;

export interface Schema<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> extends Core<$Definition, $Adaptations> {
  extend: <const $Extension extends Definition>(
    extender: Extender<$Definition, $Extension>,
  ) => Schema<ShallowMerge<$Definition, $Extension>, $Adaptations>;
  refine: <const $Refinement extends Refinement<$Definition>>(
    refiner: Refiner<$Definition, $Refinement>,
  ) => Schema<ShallowMerge<$Definition, $Refinement>, $Adaptations>;
  override: (
    override: Override<$Definition>,
  ) => Schema<$Definition, $Adaptations>;

  /**
   * Layer an opaque production on this schema's existing `[Meta]` — carrying
   * `definition`/`refinements` forward, not discarding them, so
   * `extend`/`refine`/`override` keep working (they drop the custom producer
   * again, falling back to definition-based fabrication) and a later
   * `.as(...)` (or future validation of `produce`) still has the definition
   * to check against.
   */
  as: (
    produce: Produce<Fabricated<$Definition>>,
  ) => Schema<$Definition, $Adaptations>;

  /**
   * Override what this schema maps to in one or more external schema
   * libraries — see `string/Schema.ts`'s `adapt` for the full contract.
   * Carried through `extend`/`refine`/`override`, which all reduce to a
   * fresh `make(...)` (`Registry.ts`) over this same schema.
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

/**
 * Unlike every other kind, `adapt` is *not* added here but by `Registry.ts`'s
 * `make` alongside `extend`/`refine`/`override`: those three rebuild from
 * `definition`/`refinements` rather than deriving from this object, so the
 * adaptation map has to be threaded through `make` itself or chaining one
 * of them would drop it (see `make`'s `adapt`).
 */
export function Schema<
  $Definition extends Definition,
  $Adaptations extends Adaptations = {},
>(
  schema: Omit<Schema<$Definition, $Adaptations>, "as">,
): Schema<$Definition, $Adaptations> {
  return {
    ...schema,
    [Kind]: "object",
    as: (produce) =>
      Schema({ ...schema, [Meta]: { ...schema[Meta], produce } }),
  };
}

export function isObjectSchema(candidate: AnySchema): candidate is Schema {
  return candidate[Kind] === "object";
}
