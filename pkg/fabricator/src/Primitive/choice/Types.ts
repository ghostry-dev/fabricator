import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { AnySchema, ValueOf } from "../../Schema/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

/** The schemas a `choice` can draw from. */
export type Item = AnySchema;

/**
 * A _tuple_ of `[weight, option]` pairs, one per position — not a flattened
 * `ReadonlyArray<[number, Item]>`, which would remember only the union of every
 * option's type and lose how many options there were (two identical option
 * types would collapse to one union member). The real tuple is what lets
 * `Adapter/TypeBox` mirror TypeBox's `Union<T>` — which collapses to a bare
 * schema for a single option and only wraps in `TUnion<T>` for two or more —
 * instead of always wrapping regardless of count.
 */
export type Items = ReadonlyArray<readonly [number, Item]>;

export type Fabricated<
  $Items extends Items = Items,
  $Bindings extends unknown[] = [],
> = ValueOf<$Items[number][1], $Bindings>;

/**
 * Always stored as weighted pairs — `.uniform(...)` (`Registry.ts`) is
 * `.weighted(...)` with every item given weight `1`, so there is only one shape
 * to fabricate from. `produce` layers an opaque production via `.as()`, carried
 * alongside `items` rather than replacing it, so a prior option set survives
 * `.as()` for future validation.
 */
export type Meta<$Items extends Items = Items> = {
  items: $Items;
  produce?: Produce<Fabricated<$Items>>;
};

export interface Core<
  $Items extends Items = Items,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "choice";
  [Meta]: Meta<$Items>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Items, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
