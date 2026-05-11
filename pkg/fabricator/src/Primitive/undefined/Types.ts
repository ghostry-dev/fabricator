import type { Adaptations } from "../../Adapter/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

export type Fabricated = undefined;

/**
 * Nothing to configure: `undefined` has exactly one possible value, so
 * there is no `.as()` (see `always/Types.ts` for the same reasoning) and
 * no other knob to carry.
 */
export type Meta = Record<string, never>;

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "undefined";
  [Meta]: $Meta;
  readonly [Produces]?: Fabricated;
  readonly [Adaptation]?: $Adaptations;
};
