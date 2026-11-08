import type { Adaptations } from "../../Adapter/Types";
import type {
  AdmittedEnds,
  InputAdmittedEnds,
  InputLength,
  Length,
} from "../../Bound";
import type { Produce } from "../../Random/Types";
import type { AnySchema, Fabricated as FabricatedBy } from "../../Schema/Types";
import {
  Produces,
  type Adaptation,
  type Kind,
  type Meta,
  type Produced,
} from "../../Types";
import type { Redraws } from "../../Unique/Strategy";

/**
 * A Schema usable as a record's keys: any Schema whose fabricated value is a
 * legal JS property key. Constrained through the phantom `[Produces]` marker
 * rather than by enumerating kinds, so any current or future key-producing kind
 * qualifies — `T.string.whereby(...)`, `T.symbol`, `T.enum.uniform([...])` of
 * strings, `T.always("k")`, a string `T.choice` — while `T.number`/`T.date` are
 * rejected at the call site.
 *
 * `symbol` is included deliberately: symbols are legal property keys. Excluding
 * them would arbitrarily narrow what a record can describe. They do not survive
 * `Adapter/TypeBox` — see its `record` case.
 *
 * Matched through the box (`Produced<…>`, `Types.ts`) so that a key schema
 * which may produce `undefined` is rejected whatever the caller's
 * `exactOptionalPropertyTypes` — unboxed and with the flag off, the optional
 * slot already admits `undefined`.
 */
export type Key = AnySchema & {
  readonly [Produces]?: Produced<string | symbol>;
};

export type Value = AnySchema;

/**
 * Whether a key type spans a whole primitive key type rather than a finite set
 * of literals — i.e. whether the record's keyspace is open-ended.
 */
type IsKeyspaceOpen<$Key> = string extends $Key
  ? true
  : symbol extends $Key
    ? true
    : false;

/**
 * Split is _open keyspace vs. finite_, not string vs. symbol.
 *
 * An open key (`string`, `symbol`, or both) is a plain index signature: no
 * `Partial` — an index signature never guarantees a key is present, and
 * wrapping one would only add a spurious `| undefined`. Carrying
 * `FabricatedBy<$Key>` rather than hardcoding `string` keeps a mixed `string |
 * symbol` key as `Record<string | symbol, ...>` instead of silently dropping
 * the symbol half.
 *
 * A finite literal key set (`enum`/`always`/`choice`) is `Partial`: size is
 * drawn from `whereby.size`, and colliding keys collapse (`Fabricator.ts`), so
 * a two-member key schema may produce only one. `T.unique.record` has no
 * collisions, but it still holds only as many keys as its drawn size: over
 * `["a", "b", "c"]` with `size: { min: 1, max: 3 }`, a value may hold `a`
 * alone. Only a size fixed at the key count guarantees every key, which the
 * type does not track. Every key present wants `T.object({ ... })` — what a
 * record over a finite key set degenerates to.
 */
export type Fabricated<
  $Key extends Key = Key,
  $Value extends Value = Value,
  $Bindings extends unknown[] = [],
> =
  IsKeyspaceOpen<FabricatedBy<$Key, $Bindings>> extends true
    ? Record<
        FabricatedBy<$Key, $Bindings> & PropertyKey,
        FabricatedBy<$Value, $Bindings>
      >
    : Partial<
        Record<
          FabricatedBy<$Key, $Bindings> & PropertyKey,
          FabricatedBy<$Value, $Bindings>
        >
      >;

/**
 * How many entries to attempt, uniformly across `[minTried, max]`.
 *
 * Asymmetric naming is the point. Colliding keys collapse rather than being
 * redrawn, so surviving count is only ever _at most_ what was attempted: `max`
 * is a real upper bound; the lower bound is not guaranteed and the field says
 * so. `minTried` is optional, default `0`, matching `string`'s
 * `whereby.length.min`.
 *
 * No bare-number form (unlike `string`'s and `array`'s `length`): "exactly N"
 * is a promise a collapsing key set cannot keep. `T.unique.record` draws its
 * keys distinct instead, which is what lets its {@link UniqueWhereby} keep it.
 */
export type Whereby = { size: { max: number; minTried?: number | undefined } };

/**
 * `T.unique.record`'s `.whereby`: keys are drawn distinct, so `size` is a real
 * `Length` — a bare `N` or `{ min?, max, distribution? }` whose `min` holds —
 * plus {@link Redraws}.
 */
export type InputUniqueWhereby = { size: InputLength } & Redraws;

export type UniqueWhereby = { size: Length; redraws?: number | undefined };

/**
 * `.admits(...)`'s input: the property count an adapter states, widening what
 * the record fabricates. An end is replaced, `Infinity` states no limit, and an
 * omitted end keeps what is admitted already. A plain record fabricates
 * `[minTried >= 1 ? 1 : 0, size.max]` entries, since colliding keys collapse
 * but the first attempt always lands; a unique record its drawn `size`.
 */
export type InputAdmits = { size?: InputAdmittedEnds<number> | undefined };

/**
 * `[Meta].admits`, set only by `.admits(...)` and complete once set: an absent
 * end states no limit (`Admits.ts`'s `toAdmits`).
 */
export type Admits = { size: AdmittedEnds<number> };

/**
 * `key`/`value` stay required regardless of `produce` — both are known at
 * `T.record(...)` call time and describe the shape TypeBox derives either way.
 * `produce` is carried _alongside_ `whereby` rather than replacing it, so a
 * prior size spec survives `as` for future validation — same as `array`'s
 * `Meta`.
 *
 * Two discriminants, crossed. `unique` decides `whereby`'s shape, so testing it
 * narrows `whereby` to {@link Whereby} or {@link UniqueWhereby} with no cast.
 * `produce` decides whether anything is drawn, and is `never` on the drawn
 * members so that a falsy `produce` narrows to them — an optional `Produce` on
 * every member would not narrow. Only the plain builder's `.as(...)` produces
 * with no `whereby`; `T.unique.record` has no such form, so a unique record
 * always carries its size.
 */
export type Meta<$Key extends Key = Key, $Value extends Value = Value> = {
  key: $Key;
  value: $Value;
  admits?: Admits | undefined;
} & (
  | { unique?: never; whereby: Whereby; produce?: never }
  | {
      unique?: never;
      whereby?: Whereby;
      produce: Produce<Fabricated<$Key, $Value>>;
    }
  | { unique: true; whereby: UniqueWhereby; produce?: never }
  | {
      unique: true;
      whereby: UniqueWhereby;
      produce: Produce<Fabricated<$Key, $Value>>;
    }
);

export interface Core<
  $Key extends Key = Key,
  $Value extends Value = Value,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "record";
  [Meta]: Meta<$Key, $Value>;
  bindings?: unknown[];
  readonly [Produces]?: Produced<
    Fabricated<$Key, $Value, NonNullable<this["bindings"]>>
  >;
  readonly [Adaptation]?: $Adaptations;
}
