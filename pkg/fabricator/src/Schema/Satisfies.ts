import type { NaiveFabricator } from "../Fabricator/Types";
import type { Buildable, Produces } from "../Types";
import type { ValueOf } from "./Types";

/**
 * The `this`-parameter constraint every kind's `.satisfies<$Target>()`
 * intersects onto the receiver, so a mismatch names both sides on the call that
 * failed — including a nested `T.object({ product: inner.satisfies<P>() })`,
 * where the error lands on `inner` rather than the outer object.
 *
 * `$Produced` is each kind's own `Fabricated<…>` (or `Resolved<…>` for `derive`
 * / `object.compute`, which have no `Fabricated` alias). A shared
 * `ValueOf<this>` form errors in the same place but reports `"schema produces":
 * any`, which is why each kind still names its own produced type. The check is
 * wrapped in a 1-tuple so it does not distribute over unions: a bare `$Produced
 * extends $Target ? unknown : Error` on `"x" | null` becomes `unknown | Error`,
 * which is `unknown`, and `T.nullable(…).satisfies<string>()` would pass. Other
 * signatures that were considered, and why they are not this:
 *
 * - A rest tuple `...check: D extends T ? [] : [error]` errors in the right place
 *   but says "Expected 1 arguments, but got 0".
 * - A return type `D extends T ? this : Error` is silent when the result is
 *   unused, which is the typical `schema.satisfies<T>()` statement.
 *
 * The target is not carried forward: the method is typed as returning the
 * kind's `Schema`, not a type that remembers `$Target`, so a later `.extend`
 * that changes a field's type is not re-checked. Put `.satisfies` last to check
 * the final shape. Carrying `$Target` on every `Schema` interface would add a
 * type parameter to all 25 kinds, and `.as`'s contravariant parameter check is
 * where a variance shift on those interfaces surfaces — `Types.ts`'s `ValueOf`
 * note records that same check breaking from a constraint on `$Schema`. The
 * return is `Schema`, not polymorphic `this`, because `T.date.past` /
 * `T.number.integer` / `T.symbol` are `Schema & { whereby, … }` and a `this`
 * return is not assignable into those extra members — same as `.as()`.
 */
export type SatisfiesThis<$Produced, $Target> = [$Produced] extends [$Target]
  ? unknown
  : { "schema produces": $Produced; "but target requires": $Target };

/**
 * Shared `.satisfies()` body — identity at runtime. A regular function so
 * `this` is the schema it was called on; an arrow would capture the module
 * scope. Distinct from the standalone {@link satisfies} because the two
 * signatures cannot share a name: this one is a method (`this`, return the
 * receiver); that one is a statement (`buildable`, `void`).
 */
export function schemaSatisfies<$Receiver>(this: $Receiver): $Receiver {
  return this;
}

/**
 * Whether `$Buildable` (a Schema or a built Fabricator) fabricates a value
 * assignable to `$Target`. Resolves to `true` or to an object naming both
 * sides, so asserting it (`true satisfies SatisfiedBy<…>`, or a local `type
 * Expect<_ extends true> = true` as the test suites use) fails with a readable
 * message rather than a bare `false`.
 *
 * Target first, so it reads as the sentence it asserts: `SatisfiedBy<Product,
 * typeof schema>` — `Product` is satisfied by the schema. Swapping the
 * parameters would name the opposite relationship.
 *
 * Assignable-to, not exact equality: extra fields pass. `T.optional` does not
 * satisfy `note?: string` under `exactOptionalPropertyTypes` — it produces
 * `note?: string | undefined` (present, present-as-`undefined`, or omitted).
 * `T.omittable` produces `note?: string` and does.
 */
export type SatisfiedBy<$Target, $Buildable> =
  ValueOf<$Buildable> extends $Target
    ? true
    : { produces: ValueOf<$Buildable>; required: $Target };

/**
 * Assert that `buildable` fabricates a value assignable to `$Target`. A
 * statement, and a no-op at runtime — for a built Fabricator (which has no
 * schema methods) and for a Schema the caller does not want to edit.
 *
 * `fabricate?: never` on the Schema arm is required. A built Fabricator has no
 * `[Produces]`, and a type that lacks an optional property still matches `{
 * readonly [Produces]?: $Target }` — the same trap `ValueOf` documents at
 * `Types.ts`. Without the exclusion, a non-conforming Fabricator would pass the
 * Schema arm unchecked. Ordered overloads do not replace this: overload
 * resolution falls through a failing overload onto the next one, so a
 * Fabricator rejected by `NaiveFabricator<$Target>` would still be accepted by
 * the Schema arm.
 */
export function satisfies<$Target>(
  buildable:
    | NaiveFabricator<$Target>
    | (Buildable & { fabricate?: never; readonly [Produces]?: $Target }),
): void {
  void buildable;
}
