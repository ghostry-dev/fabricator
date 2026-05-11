import type { Adaptations } from "../Adapter/Types";
import type { Kind as SchemaKind } from "../Primitive";
import type { Adaptation, Kind, Meta, Produces } from "../Types";
import type { PlainObject } from "../Utility/Types";

/**
 * The broadest Schema constraint: some kind, some config. Used by
 * compound kinds (`object`/`array`) for their nested fields instead of
 * the library-wide Schema union `Primitive/index.ts` assembles — that
 * union imports every kind's `Core.ts`, so importing it back from
 * within a kind's own `Core.ts` would cycle. Mirrors how
 * `array.Definition` uses the equally generic `NaiveFabricator<any>`
 * for the same reason.
 */
export type AnySchema = {
  [Kind]: SchemaKind;
  [Meta]: PlainObject;
  [Adaptation]?: Adaptations;
};

/**
 * Extract the value a Schema fabricates to, via the phantom,
 * runtime-absent `[Produces]` marker every kind's `Schema` carries.
 * This is what lets `object`/`array`'s per-field type extraction work
 * uniformly across every kind without importing and enumerating them
 * (which would cycle, since `object`/`array` can nest any kind,
 * including each other) — the same role `fabricate: () => $T` already
 * plays for `NaiveFabricator<infer $T>`, one step earlier, before a
 * Schema has been built. `[Produces]` is always optional (never
 * assigned at runtime — see `DeepMerge`'s handling of optional-only
 * keys for why that matters).
 *
 * `$Bindings` is threaded down into every composite kind's children
 * (each `Core` is an `interface` carrying an optional `bindings`, and
 * forwards `NonNullable<this["bindings"]>` into its own `[Produces]`).
 * It is a substitution slot for a self-reference, not a parameter of
 * the schema the way `$Definition`/`$Value` are — every composite
 * forwards it unread, so whatever `self` node is buried arbitrarily
 * deep still receives it. A node whose `[Produces]` reads
 * `bindings[0]` (`recursive.self.Core`) can then close a type-level
 * fixed point, which is what makes a self-referential schema resolve
 * rather than collapse to `unknown`. Mirrors TypeBox's
 * `Static<T, P> = (T & { params: P })['static']`, renamed because
 * "params" reads as configuration and this is closer to a
 * de-Bruijn-style resolution environment — kept as a tuple, as
 * TypeBox's is, so a second bound self-reference could occupy index 1
 * later without restructuring, though nothing today defines what that
 * would mean. `test/ValueOfBindings.types.test.ts` is the only thing
 * asserting any of it.
 *
 * Three details here are load-bearing, and each looks simplifiable:
 *
 * - **Indexed access, not a conditional `infer`.** Writing this as
 *   `($Schema & { bindings: $Bindings }) extends { [Produces]?: infer $T } ? ...`
 *   fails with `TS2615` — the bindings do not collapse, and the error
 *   surfaces as `unknown[] & [...]`.
 * - **`Required<>`, never `Exclude<..., undefined>`.** Both strip the
 *   `| undefined` that indexing an optional property adds, but
 *   `Exclude` also strips the *legitimate* `undefined` out of
 *   `nullish`/`undefinable`/`object.optional`/`undefined`'s own value
 *   types.
 * - **The `extends` guard belongs inside, not on the parameter.**
 *   Constraining `$Schema` instead would force `[Produces]` onto
 *   `AnySchema` (which deliberately omits it), and that shifts
 *   variance enough to break `.as`'s contravariant parameter check in
 *   `Fabrication.types.test.ts`.
 */
export type ValueOf<
  $Schema,
  $Bindings extends unknown[] = [],
> = $Schema extends { readonly [Produces]?: unknown }
  ? Required<$Schema & { bindings: $Bindings }>[typeof Produces]
  : unknown;
