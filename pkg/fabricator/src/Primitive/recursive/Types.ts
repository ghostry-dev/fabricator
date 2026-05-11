import type { Adaptations } from "../../Adapter/Types";
import type { AnySchema, ValueOf } from "../../Schema/Types";
import { Produces, type Adaptation, type Kind, type Meta } from "../../Types";

/**
 * Fixed point of a recursive schema. A self-referential alias, normally
 * `TS2456` ("`RecursiveValue` circularly references itself") — legal *only*
 * because `ValueOf`'s second argument is read through an interface member
 * (`this["bindings"]` on every composite `Core`), which TypeScript defers.
 * Do not rewrite as a conditional; that reintroduces the error. See
 * `CLAUDE.md`'s "`ValueOf`'s `$Bindings`".
 *
 * Wherever `self` sits in `$Body` (nested through `array`/`object`/`tuple`/
 * etc., each forwarding `this["bindings"]`), it reads `bindings[0]` —
 * `RecursiveValue<$Body>` itself, closing the loop.
 */
export type RecursiveValue<$Body> = ValueOf<$Body, [RecursiveValue<$Body>]>;

export type Fabricated<$Body> = RecursiveValue<$Body>;

/**
 * `terminal` is what `self` expands into at `depth.max`, in place of `body`.
 * Expansion is lazy (per `self`, at fabricate time) — see `Fabricator.ts`.
 *
 * Constraining `terminal` against `RecursiveValue<$Body>` as a plain field
 * type (not `terminal`'s own type parameter) is enough: structural
 * assignability already rejects a wrong terminal (e.g. missing a required
 * field `body` has), and nothing downstream needs `terminal`'s precise type
 * (`Core`'s `[Produces]` depends only on `$Body`). A bare-vs-generic
 * comparison rejects the same wrong terminal either way.
 *
 * Omitted, `terminal` is derived from `body` (`Terminate.ts`): every `self`
 * behind a declining kind is rewritten into a stop (empty array/record,
 * remaining non-`self` choice arms, `null`/`undefined`/`Omitted`). A
 * required `self` cannot be derived — `.whereby()` throws
 * `UnterminableRecursiveError`, and an explicit `terminal` is the way out.
 * A provided `terminal` is a wholesale override of that derivation (custom
 * leaf values, a narrower JSON leaf), not a patch of `self` sites.
 *
 * `depth.max` is a ceiling, not a target: `fabricateAt` (`Fabricator.ts`)
 * only *compares* a counter against it, never draws one — unlike
 * `array`/`record`/`string`'s `{min, max}`, there is no drawn count for a
 * `min` to constrain. Realized depth is emergent: intervening kinds decline
 * to recurse (an `array`/`record` rolling 0, a `choice` picking a non-`self`
 * option, an `omittable`/`optional`/`undefinable` resolving absent). The
 * recursive node has no say. "Force `body` while `depth` is below some
 * `min`" is a no-op: that already happens below `depth.max`. A genuine floor
 * would coerce those intervening kinds' draws — a different feature than a
 * second number here. The derived terminal may empty a collection whose
 * `body` said `length.min > 0`: the ceiling has to stop somehow, and an
 * explicit `terminal` already did the same with `T.opaque(() => [])`.
 */
export type Whereby<$Body> = {
  depth: { max: number };
  terminal?:
    (AnySchema & { readonly [Produces]?: RecursiveValue<$Body> }) | undefined;
};

/**
 * `terminal` is stored as `AnySchema` — once `.whereby(...)` has checked it
 * against `RecursiveValue<$Body>`, nothing downstream needs its precise type
 * (unlike `object.compute`'s `source`, which feeds `Resolved<$Source>`).
 */
export type Meta<$Body = unknown> = {
  body: $Body;
  depth: { max: number };
  terminal: AnySchema;
};

/**
 * A `type` alias, not an `interface` — unlike every composite that *contains*
 * a `self`, `recursive` is where the fixed point *closes*, so `[Produces]`
 * never needs `this["bindings"]`: `RecursiveValue` is already concrete once
 * `$Body` is, regardless of bindings this schema sits inside (a nested
 * `T.recursive` is its own independent fixed point).
 */
export type Core<$Body = unknown, $Adaptations extends Adaptations = {}> = {
  [Kind]: "recursive";
  [Meta]: Meta<$Body>;
  readonly [Produces]?: Fabricated<$Body>;
  readonly [Adaptation]?: $Adaptations;
};
