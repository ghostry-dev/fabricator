import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

/**
 * The values an `enum` can draw from — any value at all, for the same
 * reason `always.Value` is unconstrained (see its doc).
 *
 * What still separates `enum` from `choice`: an `enum` draws one of these
 * exact *values*; a `choice` draws one of these *schemas* and fabricates
 * from it.
 */
export type Item = unknown;

/**
 * A *tuple* of `[weight, item]` pairs, one per position — not a flattened
 * `ReadonlyArray<[number, Item]>`, which would remember only the union of
 * every member's type and lose how many members there were (two identical
 * member types would collapse to one union member). The real tuple is what
 * lets `Adapter/TypeBox` mirror TypeBox's `Union<T>` — which collapses to a
 * bare schema for a single member and only wraps in `TUnion<T>` for two or
 * more — instead of mapping each member independently and losing the union
 * wrapper.
 *
 * Identical shape to `choice.Items`; the two kinds differ only in what sits
 * on the right of each pair (a value here, a Schema there).
 */
export type Items = ReadonlyArray<readonly [number, Item]>;

export type Fabricated<$Items extends Items = Items> = $Items[number][1];

/**
 * Always stored as weighted pairs — `.uniform(...)` (`Registry.ts`) is
 * `.weighted(...)` with every item given weight `1`, so there is only one
 * shape to fabricate from. `produce` layers an opaque production via
 * `.as()`, carried alongside `items` rather than replacing it, so a prior
 * member set survives `.as()` for future validation.
 */
export type Meta<$Items extends Items = Items> = {
  items: $Items;
  produce?: Produce<Fabricated<$Items>>;
};

export type Core<
  $Items extends Items = Items,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "enum";
  [Meta]: Meta<$Items>;
  readonly [Produces]?: Fabricated<$Items>;
  readonly [Adaptation]?: $Adaptations;
};
