import type { Adaptations } from "../../Adapter/Types";
import type { Produce } from "../../Random/Types";
import type { AnySchema, ValueOf } from "../../Schema/Types";
import { Produces, type Adaptation, type Kind, type Meta } from "../../Types";

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
 */
export type Key = AnySchema & { readonly [Produces]?: string | symbol };

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
 * `ValueOf<$Key>` rather than hardcoding `string` keeps a mixed `string |
 * symbol` key as `Record<string | symbol, ...>` instead of silently dropping
 * the symbol half.
 *
 * A finite literal key set (`enum`/`always`/`choice`) is `Partial`: size is
 * drawn from `whereby.size`, and colliding keys collapse (`Fabricator.ts`), so
 * a two-member key schema may produce only one. Every key present wants
 * `T.object({ ... })` — what a record over a finite key set degenerates to.
 */
export type Fabricated<
  $Key extends Key = Key,
  $Value extends Value = Value,
  $Bindings extends unknown[] = [],
> =
  IsKeyspaceOpen<ValueOf<$Key, $Bindings>> extends true
    ? Record<ValueOf<$Key, $Bindings> & PropertyKey, ValueOf<$Value, $Bindings>>
    : Partial<
        Record<
          ValueOf<$Key, $Bindings> & PropertyKey,
          ValueOf<$Value, $Bindings>
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
 * No bare-number form (unlike `array`'s `length`): "exactly N" is a promise a
 * collapsing key set cannot keep.
 */
export type Whereby = { size: { max: number; minTried?: number | undefined } };

/**
 * `key`/`value` stay required regardless of `produce` — both are known at
 * `T.record(...)` call time and describe the shape TypeBox derives either way.
 * `produce` is carried _alongside_ `whereby` rather than replacing it, so a
 * prior size spec survives `as` for future validation — same as `array`'s
 * `Meta`.
 */
export type Meta<$Key extends Key = Key, $Value extends Value = Value> =
  | { key: $Key; value: $Value; whereby: Whereby; produce?: never }
  | {
      key: $Key;
      value: $Value;
      whereby?: Whereby;
      produce: Produce<Fabricated<$Key, $Value>>;
    };

export interface Core<
  $Key extends Key = Key,
  $Value extends Value = Value,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "record";
  [Meta]: Meta<$Key, $Value>;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<$Key, $Value, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
