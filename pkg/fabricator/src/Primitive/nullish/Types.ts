import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { AnySchema, ValueOf } from "../../Schema/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

/**
 * The wrapped schema — the value type produced when the roll lands on
 * neither `null` nor `undefined`.
 */
export type Definition = AnySchema;

export type Fabricated<
  $Definition extends Definition,
  $Bindings extends unknown[] = [],
> = ValueOf<$Definition, $Bindings> | null | undefined;

export type { Outcome } from "./Outcomes";

/**
 * Relative weights for `.weighted(...)`, keyed by `Outcome`. Keys optional —
 * an omitted key falls back to baseline `1`, the same weight the uniform
 * 1/3 split already uses. Values are relative, exactly like `weighted()`
 * (`Distribution/index.ts`) — they need not sum to one, and are fed to
 * `weighted()` unchanged alongside each unspecified key's baseline `1`.
 *
 * Specifying one outcome's weight shifts *every* outcome's resulting
 * probability, not just the named one — unspecified ones stay at weight `1`
 * but their share of the total still moves, since the total changed.
 * `.weighted({ null: 0.1 })` on `T.nullish` is not "10% null, other two
 * still 33%" — with `undefined`/`value` at default `1`, the split is
 * `0.1 / 2.1 ≈ 4.8%` null and `≈47.6%` each for the other two. No
 * independent "absolute probability" mode; weights are only meaningful
 * relative to the full set in play.
 */
export type Weights =
  | { null: number; undefined?: number | undefined; value?: number | undefined }
  | { null?: number | undefined; undefined: number; value?: number | undefined }
  | {
      null?: number | undefined;
      undefined?: number | undefined;
      value: number;
    };

/**
 * `definition` stays required regardless of `produce` — an opaque `as`
 * production layers on top rather than replacing it, so a prior definition
 * survives `as` for future validation of `produce` (and so `ToTypeBox`'s
 * structural derivation of the wrapped shape keeps working either way).
 */
export type Meta<$Definition extends Definition = Definition> = {
  definition: $Definition;
  produce?: Produce<Fabricated<$Definition>>;
  weights?: Weights;
};

export interface Core<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "nullish";
  [Meta]: Meta<$Definition>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Definition, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
