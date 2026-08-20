import type { Adaptations } from "../Adapter/Types";
import type { Kind as SchemaKind } from "../Primitive";
import { Adaptation, Kind, Meta, type Produces } from "../Types";
import { isPlainObject, never } from "../Utility/Core";
import { type PlainObject } from "../Utility/Types";

/**
 * Normalize a Schema, a builder namespace, or an already-built Fabricator into
 * a clean, storable Schema — keeping only `[Kind]`/ `[Meta]`/`[Adaptation]` and
 * discarding `fabricate` and any builder-method properties. This is what lets
 * `object`/`array` fields, and registry `.extend()` registrations, accept any
 * of the three interchangeably while only ever storing inert data: a built
 * Fabricator's `[Meta]` is exactly the Schema it came from.
 *
 * `[Adaptation]` is carried rather than dropped because it is a property of the
 * schema itself, not of the builder that produced it: a field adapted with
 * `.adapt(adapter, produce)` has to still be adapted once normalized into its
 * enclosing `object`/`array`, which is where every adapter actually reads it
 * from (see `Adapter/TypeBox`'s `build`, which walks `[Meta].definition`).
 *
 * `$SchemaProduces` is threaded through in the type only (never read or written
 * at runtime) so `ValueOf` stays precise across a `toSchema` call — dropping it
 * would make every normalized field (e.g. every `object`/`array` element) fall
 * back to `unknown`.
 */
export function toSchema<
  $Kind extends string,
  $Meta extends PlainObject,
  $Produces = unknown,
  $Adaptations extends Adaptations = Adaptations,
>(value: {
  [Kind]: $Kind;
  [Meta]: $Meta;
  [Produces]?: $Produces;
  [Adaptation]?: $Adaptations;
}): {
  [Kind]: $Kind;
  [Meta]: $Meta;
  readonly [Produces]?: $Produces;
  readonly [Adaptation]?: $Adaptations;
} {
  const adaptations = value[Adaptation];

  return adaptations
    ? { [Kind]: value[Kind], [Meta]: value[Meta], [Adaptation]: adaptations }
    : { [Kind]: value[Kind], [Meta]: value[Meta] };
}

/**
 * Whether `value`'s basic JS shape is compatible with `kind` (one of this
 * library's `[Kind]` literals, e.g. `"string"`, `"object"`, `"date"`). Stops at
 * "is this the right _kind of value_" (right JS type/shape), not deeper schema
 * constraints like a number's `whereby` range, a string's length, or a
 * weighted-enum's member set.
 */
export function violatesKind(kind: SchemaKind, value: unknown): boolean {
  switch (kind) {
    case "object":
      return !isPlainObject(value);
    case "array":
      return !Array.isArray(value);
    /**
     * Coarse shape only, like `object` above — the key set and entry count are
     * finer-grained constraints this function can't see without `[Meta]`.
     */
    case "record":
      return !isPlainObject(value);
    /**
     * Arity is deliberately unchecked, same as this function's other kinds that
     * need more than a basic JS shape — a wholesale- overridden tuple field of
     * the wrong length still passes here and is left to fail downstream.
     */
    case "tuple":
      return !Array.isArray(value);
    case "string":
      return typeof value !== "string";
    case "number":
      return typeof value !== "number";
    case "boolean":
      return typeof value !== "boolean";
    case "bigint":
      return typeof value !== "bigint";
    case "symbol":
      return typeof value !== "symbol";
    case "date":
      return !(value instanceof Date);
    case "undefined":
      return value !== undefined;
    case "null":
      return value !== null;
    /**
     * Never checked directly — `object/Registry.ts`'s `.override()` unwraps to
     * the wrapped field's own kind (or accepts `null` outright) before calling
     * this, the same way it unwraps `undefinable`.
     */
    case "nullable":
      return false;
    /**
     * Never checked directly — `object/Registry.ts`'s `.override()` unwraps to
     * the wrapped field's own kind (or accepts `null`/ `undefined` outright)
     * before calling this, the same way it unwraps `nullable`/`undefinable`.
     */
    case "nullish":
      return false;
    /**
     * Never checked directly: an `always` accepts any value at all (see
     * `always/Types.ts`'s `Value`), so there is no basic JS shape to reject.
     * Checking the one value it actually produces would need the `[Meta]` this
     * function doesn't receive — the same still-open TODO as `choice` below.
     */
    case "always":
      return false;
    /**
     * Never checked directly, same reason as `always` above and `enum`/`choice`
     * below: an opaque value is whatever its producer returns, so every value
     * is a possible one and there is no basic JS shape to reject.
     */
    case "opaque":
      return false;
    /**
     * Never checked directly: a recursive schema's value is whatever `body`
     * fabricates to at whatever depth it reaches — a JSON-value body could be a
     * string, a number, an object, or an array, all equally valid — so there is
     * no single basic shape to check without dispatching `body` itself, which
     * this function doesn't do.
     */
    case "recursive":
      return false;
    /**
     * Never checked directly, and never reached in ordinary use: `self` only
     * ever appears nested inside a `T.recursive` body/terminal, never as a
     * field's own top-level kind an override would validate against.
     */
    case "recursive.self":
      return false;
    /**
     * Never checked directly, same reason as `always` above: an `enum`'s
     * members can be any value at all, so — exactly like `choice` below — there
     * is no single basic shape to check without the member set `[Meta]`
     * carries.
     */
    case "enum":
      return false;
    /**
     * Never checked directly: a `choice`'s options can each be any kind — there
     * is no single basic shape to check without the option schemas `[Meta]`
     * carries, which this function doesn't receive. Deeper member-set/option
     * validation is the same still-open TODO as every other kind's
     * finer-grained constraints.
     */
    case "choice":
      return false;
    case "object.compute":
      return false;
    /**
     * Never checked directly — `object/Registry.ts`'s `.override()` unwraps to
     * the wrapped field's own kind before calling this (see its
     * `isObjectOmittableSchema` branch), the same way it unwraps
     * `object.compute`.
     */
    case "object.omittable":
      return false;
    /**
     * Never checked directly — `object/Registry.ts`'s `.override()` unwraps to
     * the wrapped field's own kind (or accepts `Omitted`/ `undefined` outright)
     * before calling this, the same way it unwraps
     * `object.compute`/`object.omittable`.
     */
    case "object.optional":
      return false;
    /**
     * Never checked directly — `object/Registry.ts`'s `.override()` unwraps to
     * the wrapped field's own kind (or accepts `undefined` outright) before
     * calling this, the same way it unwraps
     * `object.compute`/`object.omittable`/`object.optional`.
     */
    case "undefinable":
      return false;
    default:
      return never(kind);
  }
}
