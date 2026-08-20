import type { Adaptations } from "../../Adapter/Types";
import type { Bound, InputBound } from "../../Bound";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

export type InputWhereby = {
  min?: InputBound<bigint> | undefined;
  max: InputBound<bigint>;
};

export type Whereby = { min: Bound<bigint>; max: Bound<bigint> };

export type Fabricated = bigint;

/**
 * A ranged bigint, drawn via `whereby` — no natural bound to fuzz to, so unlike
 * `number`/`date` there's no bare form — optionally overridden by an opaque
 * `as` production, carried alongside `whereby` rather than replacing it (when
 * `whereby` was already set) so a prior range survives `as` for future
 * validation.
 */
export type Meta =
  | { whereby: Whereby; produce?: never }
  | { whereby?: Whereby; produce: Produce<Fabricated> };

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "bigint";
  [Meta]: $Meta;
  readonly [Produces]?: Fabricated;
  readonly [Adaptation]?: $Adaptations;
};
