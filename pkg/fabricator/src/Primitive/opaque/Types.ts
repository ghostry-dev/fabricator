import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import { Produces, type Adaptation, type Kind, type Meta } from "../../Types";

export type Fabricated<$T> = $T;

/**
 * A single required member, unlike the two-arm unions kinds with a `whereby`
 * carry: there is no configuration for an opaque value to layer `produce` on
 * top of — `produce` is the entire schema.
 */
export type Meta<$T = unknown> = { produce: Produce<$T> };

export type Core<$T = unknown, $Adaptations extends Adaptations = {}> = {
  [Kind]: "opaque";
  [Meta]: Meta<$T>;
  readonly [Produces]?: Fabricated<$T>;
  readonly [Adaptation]?: $Adaptations;
};
