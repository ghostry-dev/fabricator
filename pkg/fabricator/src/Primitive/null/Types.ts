import type { Adaptations } from "../../Adapter/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

export type Fabricated = null;

/**
 * Nothing to configure: `null` has exactly one possible value, so there is no
 * `.as()` (see `always/Types.ts` for the same reasoning) and no other knob to
 * carry.
 */
export type Meta = Record<string, never>;

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "null";
  [Meta]: $Meta;
  readonly [Produces]?: Fabricated;
  readonly [Adaptation]?: $Adaptations;
};
