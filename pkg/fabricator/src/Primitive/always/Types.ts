import type { Adaptations } from "../../Adapter/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

/**
 * Any value at all. Deliberately unconstrained: fabricating a fixed value
 * needs nothing of it. A `string | number | boolean` cap would be TypeBox's
 * `TLiteralValue` leaking into the primitive. Narrowing back to what a
 * given external schema library can express is that library's adapter's
 * job — see `Adapter/TypeBox`'s `toConst`.
 *
 * Kept as a named alias: it is the public name for this kind's domain, and
 * both `Registry.ts` and `Schema.ts` use it as a bound.
 */
export type Value = unknown;

export type Fabricated<$Value extends Value> = $Value;

export type Meta<$Value extends Value = Value> = { value: $Value };

export type Core<
  $Value extends Value = Value,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "always";
  [Meta]: Meta<$Value>;
  readonly [Produces]?: Fabricated<$Value>;
  readonly [Adaptation]?: $Adaptations;
};
