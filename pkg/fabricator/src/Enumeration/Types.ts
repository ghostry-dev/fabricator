import type { Kind as SchemaKind } from "../Primitive";
import type { AnySchema, ValueOf } from "../Schema/Types";
import type { Children, Kind, Meta } from "../Types";
import type { PlainObject } from "../Utility/Types";

/**
 * How a composite with more than one child combines their widths.
 * `"product"` is the cartesian product — width is the product of every
 * child's width; `at(index)` mixed-radix decodes to a full combination
 * (`combinatorial`). `"cycle"` (`coverage`) takes the widest child as
 * the composite's width, cycling narrower children to fill it — see
 * CLAUDE.md's "sum vs product" note for why cycling only ever applies
 * to `object`/`tuple` and never to a sum node (`choice`, the presence
 * wrappers), which always total their children's widths regardless of
 * strategy.
 */
export type Strategy = "product" | "cycle";

/**
 * A fresh, reproducible permutation of `0..width-1` each call — one
 * per width-`>1` node `plan()` visits, in walk order, so two nodes of
 * the same width never receive the same permutation (which would
 * otherwise iterate them in lockstep — see CLAUDE.md's note on why a
 * constant phase offset isn't enough). Only consulted under `"cycle"`;
 * `"product"`'s mixed-radix decode already visits every combination,
 * so permuting there would only reorder identical output. Built in
 * `Enumerate.ts` (which can reach `Random/`), then threaded through
 * `plan()` as data — `Plan.ts` stays a total function and never
 * imports randomness.
 */
export type Orderer = (width: bigint) => ReadonlyArray<bigint>;

/**
 * Recipe for one enumerated combination against a built Fabricator
 * tree: `undefined` for a drawn (not chosen) node — fabricate
 * normally; `{ value }` for a literal (enum member, boolean, `null`,
 * `undefined`, `Omitted`); `{ slots }`/`{ fields }` for a
 * tuple/object, recursing per position/key; `{ branch, inner }` for a
 * choice's chosen option, or a presence wrapper's "present" arm,
 * recursing into whichever child was picked.
 */
export type Pin =
  | undefined
  | { value: unknown }
  | { slots: ReadonlyArray<Pin> }
  | { fields: Record<string, Pin> }
  | { branch: number; inner: Pin };

/**
 * One enumerable dimension: how many distinct outcomes, and the `Pin`
 * for the `index`-th (`0 <= index < width`). Widths are `bigint` so a
 * schema with many combined axes can be counted exactly — a `number`
 * would silently lose precision past `Number.MAX_SAFE_INTEGER` and
 * eventually overflow to `Infinity`, which would make a combinatorial
 * limit's error message state a false count.
 */
export type Axis = {
  readonly width: bigint;
  readonly at: (index: bigint) => Pin;
};

/**
 * Resolved, already-validated enumeration limits — `initialize()` is
 * where `limits.combinatorial` is defaulted and checked
 * (`Number.isSafeInteger(limit) && limit >= 1`), so `Enumerate()`
 * always receives a value it can trust without re-validating.
 * `coverage` carries no limit here: its count is the widest single
 * axis, linear in the schema as written rather than a product, so
 * there is nothing for a limit to protect against.
 */
export type Limits = { combinatorial: number };

/**
 * The shape both `combinatorial` and `coverage` share — strategy and
 * limit differ internally, neither visible here. Takes a Schema, not
 * a built Fabricator: `AnySchema` excludes `Fabricator<any>` (which
 * carries no `[Produces]`), so `ValueOf` can't silently degrade to
 * `unknown`.
 */
export type Enumerable = <const $Schema extends AnySchema>(
  schema: $Schema,
) => Iterable<ValueOf<$Schema>>;

export type Resolvable = {
  [Kind]: SchemaKind;
  [Meta]: PlainObject<any>;
  [Children]: any;
  fabricate: (...params: any[]) => unknown;
};
