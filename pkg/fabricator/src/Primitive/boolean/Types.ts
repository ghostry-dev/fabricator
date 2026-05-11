import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

export type Fabricated = boolean;

export type Weights =
  | { true: number; false?: number | undefined }
  | { true?: number | undefined; false: number };

/**
 * An even coin flip, or a weighted one via `weights`, optionally overridden
 * by an opaque `as` production — carried alongside `weights` rather than
 * replacing it, so a prior weighting survives `as` for future validation.
 */
export type Meta = { produce?: Produce<Fabricated>; weights?: Weights };

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "boolean";
  [Meta]: $Meta;
  readonly [Produces]?: Fabricated;
  readonly [Adaptation]?: $Adaptations;
};
