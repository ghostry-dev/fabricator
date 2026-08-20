import type { Adaptations } from "../../Adapter/Types";
import type { Bound, InputBound } from "../../Bound";
import type { Distribution } from "../../Distribution";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

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

/**
 * Stored `{ min, max }` — each present end is a canonical {@link Bound}. An
 * omitted end stays omitted (fabricate fills the unbounded cap; adapters
 * forward only the ends that were named).
 */
export type Whereby = {
  min?: Bound<number> | undefined;
  max?: Bound<number> | undefined;
  distribution?: Distribution | undefined;
};

export type Fabricated = number;

/**
 * JSON-Schema keywords that constrain a number value — carried as neutral,
 * schema-library-agnostic hints (see the builder's `as`). The numeric range
 * lives on `whereby` as {@link Bound}s, which adapters forward; `hints` holds
 * only the orthogonal constraints not expressible there.
 */
export type JsonSchema = { multipleOf?: number };

/**
 * A ranged number — `whereby` is absent on the full-range form, `integer` (a
 * literal, not widened to `boolean`) selects whole-number semantics, or a
 * sequence counter (`sequence`, always paired with `integer: true`, since a
 * counter only ever yields whole numbers), optionally overridden by an opaque
 * `as` production — carried alongside the rest rather than replacing it, so a
 * prior scoping survives `as` for future validation.
 */
export type Meta = {
  whereby?: Whereby;
  integer?: boolean;
  sequence?: boolean;
  hints?: JsonSchema | undefined;
  produce?: Produce<Fabricated>;
};

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "number";
  [Meta]: $Meta;
  readonly [Produces]?: Fabricated;
  readonly [Adaptation]?: $Adaptations;
};
