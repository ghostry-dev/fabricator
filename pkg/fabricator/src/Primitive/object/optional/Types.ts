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
 * The wrapped field's Schema — the value type when the roll is
 * present-with-a-value.
 */
export type Definition = AnySchema;

/**
 * The value an optional field's key holds when present at all — the wrapped
 * value, or `undefined` (present-as-`undefined` is one of three outcomes,
 * distinct from the key not appearing). Flows through `[Produces]` into
 * `object/Types.ts`'s per-field type, so a `T.optional`-wrapped field types as
 * `{ a?: T | undefined }` — a real `?:` (from `OmittableKeys`, which also
 * covers this kind) _and_ a real `| undefined`.
 */
export type Fabricated<
  $Definition extends Definition,
  $Bindings extends unknown[] = [],
> = ValueOf<$Definition, $Bindings> | undefined;

/**
 * What an optional field's Fabricator returns: the wrapped value, `undefined`,
 * or `Omitted` when the key should not appear — whether from the built-in
 * three-way roll or, via `.as(...)`, an opaque producer.
 */
export type Resolved<$Definition extends Definition> =
  | Fabricated<$Definition>
  | typeof Omitted;

export type { Outcome } from "./Outcomes";

/**
 * Relative weights for `.weighted(...)`, keyed by `Outcome`. Keys optional — an
 * omitted key falls back to baseline `1`, the same weight the uniform 1/3 split
 * already uses. Values are relative, exactly like `weighted()`
 * (`Distribution/index.ts`) — they need not sum to one, and are fed to
 * `weighted()` unchanged alongside each unspecified key's baseline `1`.
 *
 * Specifying one outcome's weight shifts _every_ outcome's resulting
 * probability, not just the named one — unspecified ones stay at weight `1` but
 * their share of the total still moves, since the total changed. `.weighted({
 * omitted: 0.1 })` on `T.optional` is not "10% omitted, other two still 33%" —
 * with `undefined`/`value` at default `1`, the split is `0.1 / 2.1 ≈ 4.8%`
 * omitted and `≈47.6%` each for the other two. No independent "absolute
 * probability" mode; weights are only meaningful relative to the full set in
 * play.
 */
export type Weights =
  | {
      omitted: number;
      undefined?: number | undefined;
      value?: number | undefined;
    }
  | {
      omitted?: number | undefined;
      undefined: number;
      value?: number | undefined;
    }
  | {
      omitted?: number | undefined;
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
  produce?: Produce<Resolved<$Definition>>;
  weights?: Weights;
};

export interface Core<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "object.optional";
  [Meta]: Meta<$Definition>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Definition, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
