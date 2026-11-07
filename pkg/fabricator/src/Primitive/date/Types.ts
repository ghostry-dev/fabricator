import type { Adaptations } from "../../Adapter/Types";
import type {
  AdmittedEnds,
  Bound,
  InputAdmittedEnds,
  InputBound,
} from "../../Bound";
import type { Distribution } from "../../Distribution";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produced, Produces } from "../../Types";
import type { Redraws } from "../../Unique/Strategy";

/**
 * Call-site `{ min, max }` — scalars are inclusive. Either end may be omitted;
 * a missing `min` is the earliest representable instant and a missing `max` the
 * latest, the same span as a bare `T.date`. Either end may be epoch
 * milliseconds (`Bound.ts`'s `toDateBound`), stored as a `Date`.
 */
export type InputWhereby = {
  min?: InputBound<Date | number> | undefined;
  max?: InputBound<Date | number> | undefined;
  distribution?: Distribution | undefined;
};

/** `T.date.past.whereby`: `past` closes its upper end at the clock. */
export type InputPastWhereby = {
  min?: InputBound<Date | number> | undefined;
  distribution?: Distribution | undefined;
};

/** `T.date.future.whereby`: `future` closes its lower end at the clock. */
export type InputFutureWhereby = {
  max?: InputBound<Date | number> | undefined;
  distribution?: Distribution | undefined;
};

/** `T.unique.date`'s `.whereby` inputs: each plain one, plus {@link Redraws}. */
export type InputUniqueWhereby = InputWhereby & Redraws;
export type InputUniquePastWhereby = InputPastWhereby & Redraws;
export type InputUniqueFutureWhereby = InputFutureWhereby & Redraws;

/**
 * Stored `{ min, max }` — each present end is a canonical {@link Bound}. An
 * omitted end stays omitted (fabricate fills `Defaults.ts`'s `unboundedEpoch`;
 * adapters forward only the ends that were named).
 *
 * `redraws` is set only through {@link InputUniqueWhereby} and its
 * `past`/`future` forms.
 */
export type Whereby = {
  min?: Bound<Date> | undefined;
  max?: Bound<Date> | undefined;
  distribution?: Distribution | undefined;
  redraws?: number | undefined;
};

/**
 * `.admits(...)`'s input: the ends an adapter states, widening what `whereby`
 * draws. An end is replaced (epoch milliseconds convert as in `whereby`),
 * `Infinity` (or `-Infinity` for `min`) states no limit, and an omitted end
 * keeps what is admitted already.
 */
export type InputAdmits = InputAdmittedEnds<Date | number>;

/**
 * `T.date.past`'s `.admits`: its upper end is the clock, unknown until a
 * Fabricator is built, so only `min` can be widened.
 */
export type InputPastAdmits = Pick<InputAdmits, "min">;

/** `T.date.future`'s `.admits`: likewise, only `max`. */
export type InputFutureAdmits = Pick<InputAdmits, "max">;

/** The `.admits` input a date schema of `$Meta` takes, by its `mode`. */
export type InputAdmitsOf<$Meta extends Meta> = $Meta extends { mode: "past" }
  ? InputPastAdmits
  : InputAdmitsOfFuture<$Meta>;

type InputAdmitsOfFuture<$Meta extends Meta> = $Meta extends { mode: "future" }
  ? InputFutureAdmits
  : InputAdmits;

/**
 * `[Meta].admits`, set only by `.admits(...)` and complete once set: an absent
 * end states no limit (`Admits.ts`'s `toAdmits`).
 */
export type Admits = AdmittedEnds<Date>;

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
  unique?: true;
  admits?: Admits | undefined;
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
