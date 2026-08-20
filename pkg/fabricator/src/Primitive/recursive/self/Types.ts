import type { Adaptations } from "../../../Adapter/Types";
import {
  Produces,
  type Adaptation,
  type Kind,
  type Meta,
} from "../../../Types";

/**
 * The value a `self` reference resolves to at this position — whatever the
 * enclosing `T.recursive`'s current expansion binds it to. Reads `bindings[0]`,
 * the analogue of TypeBox's `TThis` reading `this['params'][0]`; see
 * `Schema/Types.ts`'s `ValueOf` for what `bindings` is and why it's a tuple.
 *
 * Unlike every other kind, `self` has no type parameter of its own — its whole
 * value comes from outside, threaded in structurally by whatever composite
 * kinds wrap it (`recursive/Types.ts`'s `RecursiveValue` is what ultimately
 * supplies `bindings[0]`).
 */
export type Fabricated<$Bindings extends unknown[] = []> = $Bindings[0];

export type Meta = Record<string, never>;

/**
 * An `interface`, not a `type` alias, so `this["bindings"]` resolves — the
 * entire mechanism this kind exists for. See `CLAUDE.md`'s "`ValueOf`'s
 * `$Bindings`" section for why threading requires this.
 */
export interface Core<$Adaptations extends Adaptations = {}> {
  [Kind]: "recursive.self";
  [Meta]: Meta;
  bindings?: unknown[];
  readonly [Produces]?: Fabricated<NonNullable<this["bindings"]>>;
  readonly [Adaptation]?: $Adaptations;
}
