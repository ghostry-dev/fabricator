import type { Adaptations } from "../../../Adapter/Types";
import type { AnySchema, ValueOf } from "../../../Schema/Types";
import {
  Kind,
  type Adaptation,
  type Meta,
  type Produces,
} from "../../../Types";

/**
 * A builder that can mint a Schema via `as` — e.g. `T.string`, `T.bigint`.
 * `compute` accepts one alongside a plain Schema so a caller needn't satisfy a
 * `whereby` just to name a computed field's type: the resolver supplies the
 * value, so the field's length/range is irrelevant.
 */
export type Builder<$Schema extends AnySchema = AnySchema> = {
  [Kind]: $Schema[typeof Kind];
  as: (produce: () => any) => $Schema;
};

/**
 * A `compute` source: the Schema whose value and shape a computed field adopts,
 * or a builder that denotes one.
 */
export type Source = AnySchema | Builder;

/**
 * The Schema a source denotes: a plain Schema is itself; a builder is the
 * Schema its `as` mints.
 */
export type Denoted<$Source> = $Source extends AnySchema
  ? $Source
  : $Source extends Builder<infer $Schema>
    ? $Schema
    : never;

/**
 * The value a source resolves to: what the Schema it denotes fabricates to.
 */
export type Resolved<$Source, $Bindings extends unknown[] = []> = ValueOf<
  Denoted<$Source>,
  $Bindings
>;

/**
 * Source and resolver are stored raw — the source whether a Schema or a builder
 * (both carry a `[Kind]`, which is all schema derivation needs), and the
 * resolver as plain data from the moment `compute(source).as(resolve)` is
 * called: `compute` never builds anything, so unlike a Fabricator's closure
 * there's nothing lossy about storing it. `source` is only used for its
 * shape/type (`Adapter/TypeBox` reflects a computed field as its source's
 * shape, unless the field itself is adapted) — the resolver draws entirely from
 * `fabricated`, never from `source`, which may not even have a buildable recipe
 * (a bare `T.string`/`T.bigint`).
 *
 * Unlike every other kind's `Meta`, this one is generic over the _enclosing
 * object's_ fabricated type as well as the source — that is what the resolver
 * is handed.
 */
export type Meta<$Fabricated, $Source extends Source> = {
  source: $Source;
  resolve: (params: { fabricated: $Fabricated }) => Resolved<$Source>;
};

export interface Core<
  $Fabricated,
  $Source extends Source,
  $Adaptations extends Adaptations = {},
> {
  [Kind]: "object.compute";
  [Meta]: Meta<$Fabricated, $Source>;
  bindings?: unknown[];
  readonly [Produces]?: Resolved<$Source, NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
