import type { Adaptations, AdaptationsOf } from "../Adapter/Types";
import type { Primitive, Kind as SchemaKind } from "../Primitive";
import type { Algorithm, Trace } from "../Random/Types";
import type { ValueOf } from "../Schema/Types";
import type { Adaptation, Kind, Meta, Produces } from "../Types";
import type { PlainObject } from "../Utility/Types";

/**
 * Threaded through `Constructor.ts`'s `make` for every dispatch of one `new
 * Fabricator(...)` construction — every branch forwards it (extending `path`,
 * never `algorithm`/`self`) into its own nested `make(...)` calls, so it
 * reaches however deeply a leaf sits nested through
 * `array`/`object`/`tuple`/etc.
 *
 * `toTrace` records this node's {@link Trace} — a plain object literal, no
 * hashing. Hashing is paid only where a kind actually calls
 * `toStreamFromTrace(algorithm, trace)`. Bound once in `construct()` to this
 * one construction's already-resolved `RandomSource`/ `ConstructionTrace` pair
 * (see `Constructor.ts`'s `resolveScope`) — every leaf calls `toTrace` with
 * only its own structural `path` and kind, never re-resolving the
 * construction's root itself. `T.recursive` is the one kind that rebinds
 * `toTrace`: each lazy expansion opens its own scope on the node's own private
 * forked `RandomSource` (see `recursive/Fabricator.ts`), so a data-dependent
 * expansion count can never perturb, or be perturbed by, anything else built
 * from the same `initialize()` instance — `RandomSource.fork`
 * (`Random/Types.ts`) is the isolation primitive.
 *
 * `algorithm` rather than the `RandomSource` itself: stream derivation depends
 * on no per-source state, and a leaf has no business with `toRoot`/`fork`.
 * `clock` is not a field of its own — it is always `trace.clock`.
 *
 * `self` is what makes `case "recursive.self"` resolve to "recurse one level
 * deeper, right now" — absent outside any active recursion, which is how `case
 * "recursive.self"` detects and rejects a `self` node used where none applies.
 */
export type ConstructionContext = {
  toTrace: (path: ReadonlyArray<string>, kind: string) => Trace;
  algorithm: Algorithm;
  self?: (() => unknown) | undefined;
};

/**
 * What every kind's `Fabricator(...)` receives in place of a repeated `(schema,
 * algorithm, trace)` positional list — `Constructor.ts`'s `make` builds one per
 * dispatched node from its own `ConstructionContext`. `trace` is already
 * path-bound and built eagerly, so a kind that never draws still records one
 * without calling `toStreamFromTrace`. Laziness is load-bearing: `toTrace` is a
 * plain object literal, and hashing is paid only where a kind actually calls
 * `toStreamFromTrace(algorithm, trace)`. The guard is the call site's own `if
 * (meta.produce)` branch (or the equivalent drawing path), not an unevaluated
 * closure. `algorithm` rather than the `RandomSource`: derivation depends on no
 * per-source state, and a leaf has no business with `toRoot`/`fork`. No
 * `clock`: it is `trace.clock`, always. A kind-specific extra — an array's
 * `element`, an object's `fields`, a choice's `weightings` — still follows as
 * its own trailing parameter: those vary per kind and were never part of the
 * shared prefix this replaces.
 */
export type FabricatorContext<$Schema> = {
  schema: $Schema;
  algorithm: Algorithm;
  trace: Trace;
};

/**
 * The most basic interface for a typed Fabricator. No type introspection is
 * possible.
 */
export type NaiveFabricator<$T> = { fabricate: () => $T };

/**
 * What every kind's `construct()` produces: a `NaiveFabricator` that also hands
 * back the Schema it was built from, via the same `[Kind]`/`[Meta]` a Schema
 * itself carries — so a built Fabricator can be passed back into
 * `object`/`array`/a registry `.extend()` anywhere a Schema is expected (see
 * `toSchema`).
 */
export type Fabricator<$T> = NaiveFabricator<$T> & {
  [Kind]: SchemaKind;
  [Meta]: PlainObject;
  readonly trace: Trace;
  /**
   * Carried over from the Schema by `Constructor.ts`'s `make` — inert to
   * fabrication, but it has to survive building for an adapter handed a built
   * Fabricator to see what the Schema declared (see `Adapter/Types.ts`).
   */
  readonly [Adaptation]?: Adaptations;
};

/**
 * The value type a built Fabricator produces — read directly off its
 * `fabricate` signature. Every kind's `construct()` output shares the exact
 * same shape (`NaiveFabricator<$T>` plus `[Kind]`/`[Meta]`, see this file's
 * `Fabricator<$T>`), so there's nothing to dispatch per kind here — unlike
 * `ValueOf`, which reads a Schema's phantom `[Produces]` marker for the
 * pre-`construct()` case, this only ever needs to unwrap an already-uniform
 * `fabricate: () => $T`.
 */
export type Fabrication<$Fabricator extends NaiveFabricator<any>> =
  $Fabricator extends NaiveFabricator<infer $T> ? $T : never;

/**
 * Maps a Schema (or an already-built Fabricator of the same kind — see the
 * `object` branch, and every other branch below since each kind's `Schema` also
 * carries a required `as` method a built Fabricator never has) to the precise,
 * kind-specific `Fabricator<...>` type it builds into. Mirrors
 * `Adapter/TypeBox/index.ts`'s `ToTypeBox` dispatch. Falls back to the loose
 * base `Fabricator<ValueOf<$Schema>>` for anything unmatched.
 *
 * No branch here needs to do anything about `[Adaptation]`: each kind's own
 * `Fabricator<$Schema>` reads it back off `$Schema` via `AdaptationsOf`, so an
 * adapted Schema's Fabricator carries the map without this dispatch (or an
 * intersection on top of it, which the warning below would otherwise apply to)
 * having to mention it. `object.compute` is the one exception, taking its
 * `$Adaptations` explicitly because its Fabricator is parameterized by the
 * computed value and source rather than by the Schema.
 *
 * Every branch's own `Fabricator<$Schema>` type already carries a `.schema`
 * field (see each kind's `Core.ts`) — _not_ added here via an extra `& {
 * schema: ... }` intersection: wrapping an already-named type in a fresh
 * intersection defeats a later `infer` over it (e.g. each kind's own
 * `Fabrication<$Fabricator>` helper, which narrows via `extends
 * Fabricator<infer $Schema>`) — TypeScript can't always decompose the
 * intersection back to recover `$Schema`, and silently widens to the generic's
 * constraint instead.
 */
/* prettier-ignore */
export type AsFabricator<$Schema> =
  /**
   * `<any>`, not bare `Primitive.object.Schema | Primitive.object.Fabricator`:
   * `Primitive.object.Schema` is an interface whose `refine` method uses
   * `$Definition` contravariantly (nested inside `Refiner`/`Computer`),
   * so `Primitive.object.Schema<{ narrow definition }>` doesn't actually extend
   * the *default*-parameterized bare `Primitive.object.Schema`
   * (`Definition<AnySchema>`) — comparing against `<any>` sidesteps
   * that variance check entirely, the same way `ToTypeBox`'s object
   * branch sidesteps it by never referencing `refine`/`extend` at all
   * (see its structural `[Meta].definition` check).
   */
  $Schema extends Primitive.object.Core
    ? Primitive.object.Fabricator<$Schema> :

  $Schema extends Primitive.object.compute.Core<infer $Fabricated, infer $Source>
    ? Primitive.object.compute.Fabricator<$Fabricated, $Source, AdaptationsOf<$Schema>> :

  $Schema extends Primitive.object.omittable.Core
    ? Primitive.object.omittable.Fabricator<$Schema> :

  $Schema extends Primitive.object.optional.Core
    ? Primitive.object.optional.Fabricator<$Schema> :

  $Schema extends Primitive.array.Core
    ? Primitive.array.Fabricator<$Schema> :

  $Schema extends Primitive.opaque.Core
    ? Primitive.opaque.Fabricator<$Schema> :

  $Schema extends Primitive.record.Core
    ? Primitive.record.Fabricator<$Schema> :

  $Schema extends Primitive.recursive.Core
    ? Primitive.recursive.Fabricator<$Schema> :

  /**
   * `self` is never independently built in ordinary use — it only ever
   * appears nested inside a `T.recursive` body, resolved by
   * `Constructor.ts`'s `make` context, not through this boundary. `[]`
   * (unbound) is the same default `self.Core` itself falls back to.
   */
  $Schema extends Primitive.recursive.self.Core
    ? Primitive.recursive.self.Fabricator<[]> :

  $Schema extends Primitive.tuple.Core
    ? Primitive.tuple.Fabricator<$Schema> :

  $Schema extends Primitive.always.Core
    ? Primitive.always.Fabricator<$Schema> :

  $Schema extends Primitive.bigint.Core
    ? Primitive.bigint.Fabricator<$Schema> :

  $Schema extends Primitive.boolean.Core
    ? Primitive.boolean.Fabricator<$Schema> :

  $Schema extends Primitive.choice.Core
    ? Primitive.choice.Fabricator<$Schema> :

  $Schema extends Primitive.enum.Core
    ? Primitive.enum.Fabricator<$Schema> :

  $Schema extends Primitive.date.Core
    ? Primitive.date.Fabricator<$Schema> :

  $Schema extends Primitive.number.Core
    ? Primitive.number.Fabricator<$Schema> :

  $Schema extends Primitive.string.Core
    ? Primitive.string.Fabricator<$Schema> :

  $Schema extends Primitive.symbol.Core
    ? Primitive.symbol.Fabricator<$Schema> :

  $Schema extends Primitive.undefined.Core
    ? Primitive.undefined.Fabricator<$Schema> :

  $Schema extends Primitive.undefinable.Core
    ? Primitive.undefinable.Fabricator<$Schema> :

  $Schema extends Primitive.null.Core
    ? Primitive.null.Fabricator<$Schema> :

  $Schema extends Primitive.nullable.Core
    ? Primitive.nullable.Fabricator<$Schema> :

  $Schema extends Primitive.nullish.Core
    ? Primitive.nullish.Fabricator<$Schema> :

  $Schema extends { readonly [Produces]?: unknown }
    ? Fabricator<ValueOf<$Schema>> :

  Fabricator<unknown>;
