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
 * a missing end is unbounded (the same policy as a bare `T.number`), not a
 * default of `0`.
 */
export type InputWhereby = {
  min?: InputBound<number> | undefined;
  max?: InputBound<number> | undefined;
  distribution?: Distribution | undefined;
};

/** `T.unique.number`'s `.whereby`: the same input, plus {@link Redraws}. */
export type InputUniqueWhereby = InputWhereby & Redraws;

/**
 * Stored `{ min, max }` — each present end is a canonical {@link Bound}. An
 * omitted end stays omitted (fabricate fills the unbounded cap; adapters
 * forward only the ends that were named). `redraws` is set only through
 * {@link InputUniqueWhereby}.
 */
export type Whereby = {
  min?: Bound<number> | undefined;
  max?: Bound<number> | undefined;
  distribution?: Distribution | undefined;
  redraws?: number | undefined;
};

/**
 * `.admits(...)`'s input: the ends an adapter states, widening what `whereby`
 * draws. An end is replaced, `Infinity` (or `-Infinity` for `min`) states no
 * limit, and an omitted end keeps what is admitted already.
 */
export type InputAdmits = InputAdmittedEnds<number> & Keywords;

/**
 * JSON-Schema keywords for what the numbers are, which adapters forward to
 * their target. Unlike an end, `multipleOf` is not checked against what is
 * drawn — like `.adapt`, the caller vouches that fabricated values match,
 * usually by fabricating through `.as(produce)`. A keyword left out keeps what
 * is admitted already.
 */
export type Keywords = { multipleOf?: number | undefined };

/**
 * `[Meta].admits`, set only by `.admits(...)` and complete once set: an absent
 * end states no limit (`Admits.ts`'s `toAdmits`).
 */
export type Admits = AdmittedEnds<number> & Keywords;

export type Fabricated = number;

/**
 * A ranged number — `whereby` is absent on the full-range form, `integer` (a
 * literal, not widened to `boolean`) selects whole-number semantics, or a
 * sequence counter (`sequence`, always paired with `integer: true`, since a
 * counter only ever yields whole numbers), optionally overridden by an opaque
 * `as` production — carried alongside the rest rather than replacing it, so a
 * prior scoping survives `as` for future validation.
 *
 * `unique` is set by `T.unique.number`: the built Fabricator never repeats a
 * value for its whole lifetime (`Unique/Distinct.ts`'s `toNumberStrategy`).
 * Never paired with `sequence`, which cannot repeat by design.
 */
export type Meta = {
  whereby?: Whereby;
  integer?: boolean;
  sequence?: boolean;
  unique?: true;
  admits?: Admits | undefined;
  produce?: Produce<Fabricated>;
};

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "number";
  [Meta]: $Meta;
  readonly [Produces]?: Produced<Fabricated>;
  readonly [Adaptation]?: $Adaptations;
};
