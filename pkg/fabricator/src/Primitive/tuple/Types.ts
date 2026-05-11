import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { AnySchema, ValueOf } from "../../Schema/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";

/** The schema occupying a single tuple slot. */
export type Item = AnySchema;

/**
 * A *tuple* of schemas, one per slot — not a flattened `ReadonlyArray`, for
 * the same reason `choice.Items` isn't (see its doc): a widened array
 * remembers only the union of every slot's type and loses arity and which
 * slot held what. The real tuple is what lets `Fabricated` resolve to
 * positional `[A, B]` rather than `(A | B)[]`, and `Adapter/TypeBox` produce
 * a `TTuple` of the right length.
 */
export type Items = ReadonlyArray<Item>;

/**
 * Head/tail recursion, not a homomorphic `{ [$K in keyof $Items]: ... }`
 * mapped type — the same trap `Adapter/TypeBox`'s `ChoiceOptions`/
 * `TupleItems` avoid: `keyof` a still-abstract `ReadonlyArray<Item>` (this
 * type's default, and what a kind-local `Fabrication<$Fabricator>` resolves
 * against for the *bare*, unparameterized `Fabricator`) pulls in
 * `"length"`/method keys that don't resolve to a sensible `ValueOf`. A
 * homomorphic version type-checks for any concrete tuple but silently
 * produces a malformed bare type, which then fails `.schema.as`'s
 * contravariant parameter check against any concrete instantiation
 * (`Fabrication.types.test.ts`). Matching a fixed-length tuple pattern at
 * every step avoids it, as `TupleItems` does for `ToTypeBox`. The fallback
 * (a genuinely widened, arity-less array) is a plain `Array<...>`, mirroring
 * `array.Fabricated` for the same bare case.
 */
export type Fabricated<
  $Items extends Items = Items,
  $Bindings extends unknown[] = [],
> = $Items extends readonly []
  ? []
  : $Items extends readonly [
        infer $Head extends Item,
        ...infer $Rest extends Items,
      ]
    ? [ValueOf<$Head, $Bindings>, ...Fabricated<$Rest, $Bindings>]
    : Array<ValueOf<$Items[number], $Bindings>>;

/**
 * No `whereby`: arity is fixed at `T.tuple([...])` and there is nothing left
 * to configure. Unlike `array`'s two-variant union this needs no
 * "config or produce" split — `produce` is a plain optional layered on top,
 * and `items` stays required so `extend`-less kinds still have the per-slot
 * shapes `ToTypeBox` derives from (and future validation of `produce` would
 * check against).
 */
export type Meta<$Items extends Items = Items> = {
  items: $Items;
  produce?: Produce<Fabricated<$Items>>;
};

export interface Core<
  $Items extends Items = Items,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "tuple";
  [Meta]: Meta<$Items>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Items, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
