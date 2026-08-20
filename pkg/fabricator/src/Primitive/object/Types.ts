import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { AnySchema, ValueOf } from "../../Schema/Types";
import {
  Kind,
  Meta,
  type Adaptation,
  type Omitted,
  type Produces,
} from "../../Types";
import { type Pretty } from "../../Utility/Types";
import type { Schema as ComputeSchema } from "./compute/Schema";

export type Definition<$Schema = AnySchema> = { [_ in string]: $Schema };

/**
 * Constraint for a refinement's values. The source schema differs per property,
 * so it must be `any` (not `AnySchema`) to stay assignable across every
 * property's own `$Source`. Constraint only: precise types still flow via
 * `$Refinement`.
 */
export type Refinement<$Definition extends Definition> = Definition<
  ComputeSchema<Fabricated<$Definition>, any>
>;

export type Extender<
  $Definition extends Definition,
  $Extension extends Definition,
> = (params: { base: $Definition }) => $Extension;

export type Refinements = ReadonlyArray<Definition>;

/**
 * Every `object.omittable`- or `object.optional`-kind field's key, so
 * `Fabricated` can mark exactly those `?:` instead of required — matching
 * runtime, where a field whose roll lands on omission never has its key appear
 * (`object/omittable/Fabricator.ts`, `object/optional/Fabricator.ts`).
 * `object.optional`'s `ValueOf` already carries `| undefined` (its
 * `Fabricated`), so combined with the `?:` here a field lands on `{ a?: T |
 * undefined }` — omitted, present-as-`undefined`, or present-with-a-value.
 */
type OmittableKeys<$Definition extends Definition> = {
  [$K in keyof $Definition]: $Definition[$K] extends {
    [Kind]: "object.omittable" | "object.optional";
  }
    ? $K
    : never;
}[keyof $Definition];

export type Fabricated<
  $Definition extends Definition,
  $Bindings extends unknown[] = [],
> = Pretty<
  {
    [$K in Exclude<keyof $Definition, OmittableKeys<$Definition>>]: ValueOf<
      $Definition[$K],
      $Bindings
    >;
  } & {
    [$K in OmittableKeys<$Definition>]?: ValueOf<$Definition[$K], $Bindings>;
  }
>;

/**
 * The shape `.override()` accepts: every field optional, so a present key skips
 * generation for that field. A nested `object`-kind field recurses into its own
 * `Override` (deep-merge); an `object.omittable` or `object.optional` field
 * additionally accepts `Omitted`, to force that field off rather than only
 * forcing a value on (`object.optional` already accepts `undefined` via
 * `ValueOf`); every other field — including `object.compute` — is a
 * full-replacement leaf, typed as whatever it fabricates to (`ValueOf`).
 *
 * Checked via a bare structural `[Kind]`/`[Meta]` shape, never `Schema`/
 * `Fabricator` — either carries `refine`'s contravariant use of `$Definition`,
 * and referencing it here would leak that contravariance into every recursive
 * `Override` instantiation.
 */
export type Override<$Definition extends Definition> = Pretty<{
  [$K in keyof $Definition]?: $Definition[$K] extends {
    [Kind]: "object";
    [Meta]: { definition: infer $Nested extends Definition };
  }
    ? Override<$Nested>
    : $Definition[$K] extends { [Kind]: "object.omittable" | "object.optional" }
      ? ValueOf<$Definition[$K]> | typeof Omitted
      : ValueOf<$Definition[$K]>;
}>;

/**
 * `definition`/`refinements` stay required regardless of `produce` — an opaque
 * `as` production layers on top rather than replacing them, so
 * `extend`/`refine`/`override` and `ToTypeBox`'s structural derivation keep
 * working, and a prior definition survives `as` for future validation of
 * `produce`.
 */
export type Meta<$Definition extends Definition = Definition> = {
  definition: $Definition;
  refinements: Refinements;
  produce?: Produce<Fabricated<$Definition>>;
};

export interface Core<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "object";
  [Meta]: Meta<$Definition>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Definition, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
