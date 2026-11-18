import type { Adaptations } from "../../Adapter/Types.ts";
import type { Produce } from "../../Random/Types.ts";
import {
  Produces,
  type Adaptation,
  type Kind,
  type Meta,
  type Produced,
} from "../../Types.ts";

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
  readonly [Produces]?: Produced<Fabricated<$T>>;
  readonly [Adaptation]?: $Adaptations;
};
