import type { Adaptations } from "../../Adapter/Types.ts";
import type { Produce } from "../../Random/Types.ts";
import type {
  Adaptation,
  Kind,
  Meta,
  Produced,
  Produces,
} from "../../Types.ts";

export type Fabricated = symbol;

/**
 * A symbol keyed via `keyed`, or unkeyed if `key` is absent, optionally
 * overridden by an opaque `as` production — carried alongside `key` rather than
 * replacing it, so a prior keying survives `as` for future validation.
 */
export type Meta = { key?: string; produce?: Produce<Fabricated> };

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "symbol";
  [Meta]: $Meta;
  readonly [Produces]?: Produced<Fabricated>;
  readonly [Adaptation]?: $Adaptations;
};
