import type { Adaptations } from "../../Adapter/Types";
import type { Bound, InputBound } from "../../Bound";
import type { Produce } from "../../Random/Types";
import type { AnySchema, ValueOf } from "../../Schema/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

export type Definition = AnySchema;

export type Fabricated<
  $Definition extends Definition,
  $Bindings extends unknown[] = [],
> = Array<ValueOf<$Definition, $Bindings>>;

export type InputWhereby = {
  length:
    number | { max: InputBound<number>; min?: InputBound<number> | undefined };
};

export type Whereby = { length: { min: Bound<number>; max: Bound<number> } };

/**
 * `whereby` (a length spec — no natural bound to fuzz to, so unlike
 * `number`/`date` there's no bare form), optionally overridden by an
 * opaque `as` production, carried alongside `whereby` rather than replacing
 * it (when `whereby` was already set) so a prior length spec survives `as`
 * for future validation. `definition` stays required regardless — it's
 * known at `T.array(...)` call time and describes the element shape TypeBox
 * derives either way.
 */
export type Meta<$Definition extends Definition = Definition> =
  | { definition: $Definition; whereby: Whereby; produce?: never }
  | {
      definition: $Definition;
      whereby?: Whereby;
      produce: Produce<Fabricated<$Definition>>;
    };

export interface Core<
  $Definition extends Definition = Definition,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "array";
  [Meta]: Meta<$Definition>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Definition, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
