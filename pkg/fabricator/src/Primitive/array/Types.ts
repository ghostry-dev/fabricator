import type { Adaptations } from "../../Adapter/Types";
import type { InputLength, Length } from "../../Bound";
import type { Produce } from "../../Random/Types";
import type { AnySchema, Fabricated as FabricatedBy } from "../../Schema/Types";
import type { Adaptation, Kind, Meta, Produced, Produces } from "../../Types";
import type { Redraws } from "../../Unique/Strategy";

export type Definition = AnySchema;

export type Fabricated<
  $Definition extends Definition,
  $Bindings extends unknown[] = [],
> = Array<FabricatedBy<$Definition, $Bindings>>;

export type InputWhereby = { length: InputLength };

/** `T.unique.array`'s `.whereby`: the same `length`, plus {@link Redraws}. */
export type InputUniqueWhereby = InputWhereby & Redraws;

export type Whereby = { length: Length; redraws?: number | undefined };

/**
 * `T.unique.array`'s marker on `[Meta]`: members are distinct within each
 * fabricated array. `by` projects a member to what must be distinct, and is
 * typed to the element at the builder (`Registry.ts`'s `unique`); stored here
 * as `any` so `Meta` stays covariant in `$Definition`.
 */
export type Unique = { by?: ((element: any) => unknown) | undefined };

/**
 * `whereby` (a length spec — no natural bound to fuzz to, so unlike
 * `number`/`date` there's no bare form), optionally overridden by an opaque
 * `as` production, carried alongside `whereby` rather than replacing it (when
 * `whereby` was already set) so a prior length spec survives `as` for future
 * validation. `definition` stays required regardless — it's known at
 * `T.array(...)` call time and describes the element shape TypeBox derives
 * either way.
 */
export type Meta<$Definition extends Definition = Definition> =
  | {
      definition: $Definition;
      whereby: Whereby;
      unique?: Unique;
      produce?: never;
    }
  | {
      definition: $Definition;
      whereby?: Whereby;
      unique?: Unique;
      produce: Produce<Fabricated<$Definition>>;
    };

export interface Core<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "array";
  [Meta]: Meta<$Definition>;
  bindings?: unknown[];
  readonly [Produces]?: Produced<
    Fabricated<$Definition, NonNullable<this["bindings"]>>
  >;
  readonly [Adaptation]?: $Adaptations;
}
