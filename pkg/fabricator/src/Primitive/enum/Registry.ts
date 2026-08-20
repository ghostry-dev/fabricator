import { assertDrawableWeights } from "../../Distribution";
import { FabricatorError } from "../../Error";
import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";
import type { Item, Items } from "./Types";

/**
 * Tuple-preserving: a mapped type over `$Items` keeps its exact length and
 * per-position member types (`{ [K in keyof $Items]: ... }` walks a tuple
 * position-by-position, unlike `ReadonlyArray<...>`'s `.map()`, which only
 * remembers the union of every element it saw). This is what lets
 * `Adapter/TypeBox` recover real arity later and mirror TypeBox's `Union<T>`
 * collapse-for-a-single-member — see `Types.ts`'s `Items`. The same helper
 * `choice/Registry.ts` uses, for the same reason.
 */
type Weighted<$Items extends ReadonlyArray<Item>> = {
  [$K in keyof $Items]: readonly [number, $Items[$K]];
};

/**
 * At least one element — an empty `enum` has no member to draw, which would
 * otherwise fail inside `weighted()` (`Distribution/index.ts`) with an opaque
 * `TypeError` at fabricate time (weight sum is `0`, so `.find` returns
 * `undefined` and `chosen![1]` throws). Rejecting emptiness here is a
 * construction-time compile error; the runtime check below is the backstop for
 * an `as any` call that bypasses it.
 */
type NonEmpty<$T> = readonly [$T, ...$T[]];

function assertNonEmpty(items: ReadonlyArray<unknown>): void {
  if (items.length === 0) {
    throw new FabricatorError.EmptyItemsError("T.enum", "member");
  }
}

export default {
  /**
   * Equal probability across every member. Delegates to `weighted` with a
   * uniform weight of `1` per item — a plain `weighted()` draw is already a
   * uniform draw when every weight is equal, so there is no separate unweighted
   * code path to keep in sync.
   */
  uniform: <const $Items extends NonEmpty<Item>>(
    items: $Items,
  ): Schema<Weighted<$Items>> => {
    assertNonEmpty(items);

    /**
     * `.map()` itself only returns `Array<...>`, not the tuple-preserving
     * `Weighted<$Items>` — the cast is safe because the runtime shape (one `[1,
     * item]` pair per input position, same order) already matches it exactly;
     * only `.map()`'s own generic signature is too loose to say so.
     */
    const weighted = items.map((x) => [1, x] as const) as Weighted<$Items>;

    return Schema({ [Kind]: "enum", [Meta]: { items: weighted } });
  },

  /**
   * Relative probability across members, given as `[weight, item]` pairs — the
   * same tuple shape `weighted()` (`Distribution/index.ts`) itself accepts, not
   * an object keyed by member.
   */
  weighted: <const $Items extends NonEmpty<Items[number]>>(
    items: $Items,
  ): Schema<$Items> => {
    assertNonEmpty(items);
    assertDrawableWeights("T.enum.weighted", "member", items);

    return Schema({ [Kind]: "enum", [Meta]: { items } });
  },
};
