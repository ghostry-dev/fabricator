import type { Adaptations } from "../../Adapter/Types";
import type { Bound, InputBound } from "../../Bound";
import type { Distribution } from "../../Distribution";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

export type InputWhereby = {
  min?: InputBound<Date> | undefined;
  max?: InputBound<Date> | undefined;
  distribution?: Distribution | undefined;
};

export type Whereby = {
  min?: Bound<Date> | undefined;
  max?: Bound<Date> | undefined;
  distribution?: Distribution | undefined;
};

export type Fabricated = Date;

/**
 * A range/distribution (`whereby`, absent for the full-range bare form),
 * optionally scoped by `mode` to `"past"` (up to now) or `"future"` (from now),
 * optionally overridden by an opaque `as` production — carried alongside the
 * rest rather than replacing it, so a prior scoping survives `as` for future
 * validation.
 */
export type Meta = {
  mode?: "past" | "future";
  whereby?: Whereby;
  produce?: Produce<Fabricated>;
};

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "date";
  [Meta]: $Meta;
  readonly [Produces]?: Fabricated;
  readonly [Adaptation]?: $Adaptations;
};
