import type { Adaptations } from "../../Adapter/Types";
import type { Bound, InputBound } from "../../Bound";
import type { Distribution } from "../../Distribution";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produced, Produces } from "../../Types";

/**
 * Call-site `{ min, max }` — scalars are inclusive. Either end may be omitted;
 * a missing `min` is the earliest representable instant and a missing `max` the
 * latest, the same span as a bare `T.date`.
 */
export type InputWhereby = {
  min?: InputBound<Date> | undefined;
  max?: InputBound<Date> | undefined;
  distribution?: Distribution | undefined;
};

/**
 * Stored `{ min, max }` — each present end is a canonical {@link Bound}. An
 * omitted end stays omitted (fabricate fills `Defaults.ts`'s `unboundedEpoch`;
 * adapters forward only the ends that were named).
 */
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
  readonly [Produces]?: Produced<Fabricated>;
  readonly [Adaptation]?: $Adaptations;
};
