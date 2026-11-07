import type { Adaptations } from "../../Adapter/Types";
import type {
  AdmittedEnds,
  Bound,
  InputAdmittedEnds,
  InputBound,
} from "../../Bound";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produced, Produces } from "../../Types";

/**
 * Call-site `{ min?, max }`. Either end may be a `number` that is a safe
 * integer (`Bound.ts`'s `toBigintBound`), stored as a `bigint`.
 */
export type InputWhereby = {
  min?: InputBound<bigint | number> | undefined;
  max: InputBound<bigint | number>;
};

export type Whereby = { min: Bound<bigint>; max: Bound<bigint> };

/**
 * `.admits(...)`'s input: the ends an adapter states, widening what `whereby`
 * draws. An end is replaced (a safe-integer `number` converts as in `whereby`),
 * `Infinity` (or `-Infinity` for `min`) states no limit, and an omitted end
 * keeps what is admitted already.
 */
export type InputAdmits = InputAdmittedEnds<bigint | number>;

/**
 * `[Meta].admits`, set only by `.admits(...)` and complete once set: an absent
 * end states no limit (`Admits.ts`'s `toAdmits`).
 */
export type Admits = AdmittedEnds<bigint>;

export type Fabricated = bigint;

/**
 * A ranged bigint, drawn via `whereby` — no natural bound to fuzz to, so unlike
 * `number`/`date` there's no bare form — optionally overridden by an opaque
 * `as` production, carried alongside `whereby` rather than replacing it (when
 * `whereby` was already set) so a prior range survives `as` for future
 * validation.
 *
 * `unique` is set by `T.unique.bigint`: the built Fabricator yields its range
 * as a random permutation, never repeating for its whole lifetime
 * (`Unique/Distinct.ts`'s `toBigintStrategy`).
 */
export type Meta =
  | {
      whereby: Whereby;
      unique?: true;
      admits?: Admits | undefined;
      produce?: never;
    }
  | {
      whereby?: Whereby;
      unique?: true;
      admits?: Admits | undefined;
      produce: Produce<Fabricated>;
    };

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "bigint";
  [Meta]: $Meta;
  readonly [Produces]?: Produced<Fabricated>;
  readonly [Adaptation]?: $Adaptations;
};
