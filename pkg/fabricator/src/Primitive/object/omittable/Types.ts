import type { Adaptations } from "../../../Adapter/Types";
import type { Produce } from "../../../Random/Types";
import type { AnySchema, ValueOf } from "../../../Schema/Types";
import {
  Kind,
  Meta,
  Omitted,
  type Adaptation,
  type Produces,
} from "../../../Types";

/**
 * The wrapped field's own Schema — the value type an omittable field produces
 * when its presence roll comes up present.
 */
export type Definition = AnySchema;

export type Fabricated<
  $Definition extends Definition,
  $Bindings extends unknown[] = [],
> = ValueOf<$Definition, $Bindings>;

/**
 * What an omittable field's Fabricator returns: the wrapped value, or `Omitted`
 * when it should not appear — whether from the built-in presence roll or, via
 * `.as(...)`, an opaque producer.
 */
export type Resolved<$Definition extends Definition> =
  | Fabricated<$Definition>
  | typeof Omitted;

export type { Outcome } from "./Outcomes";

/**
 * Relative weights for `.weighted(...)`, keyed by `Outcome`. Keys optional — an
 * omitted key falls back to baseline `1`, the same weight the 50/50 split
 * already uses. Values are relative, exactly like `weighted()`
 * (`Distribution/index.ts`) — they need not sum to one, and are fed to
 * `weighted()` unchanged alongside each unspecified key's baseline `1`.
 *
 * Specifying one outcome's weight shifts the _other_ outcome's resulting
 * probability too, even though its weight stays at `1` — its share of the total
 * still moves, since the total changed. `.weighted({ omitted: 0.1 })` is not
 * "10% omitted, 90% present" — with `value` at default `1`, the split is `0.1 /
 * 1.1 ≈ 9.1%` omitted, `≈90.9%` present. No independent "absolute probability"
 * mode; weights are only meaningful relative to the full set in play.
 */
export type Weights =
  | { omitted: number; value?: number | undefined }
  | { omitted?: number | undefined; value: number };

/**
 * `definition` stays required regardless of `produce` — an opaque `as`
 * production layers on top rather than replacing it, so a prior definition
 * survives `as` for future validation of `produce` (and so `ToTypeBox`'s
 * structural derivation of the wrapped shape keeps working either way).
 */
export type Meta<$Definition extends Definition = Definition> = {
  definition: $Definition;
  produce?: Produce<Resolved<$Definition>>;
  weights?: Weights;
};

export interface Core<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "object.omittable";
  [Meta]: Meta<$Definition>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Definition, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
