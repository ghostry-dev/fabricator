import type { Adaptations } from "../../Adapter/Types";
import {
  assertNonemptyDiscrete,
  epochBound,
  toBound,
  type InputBound,
} from "../../Bound";
import { type Distribution } from "../../Distribution";
import { Adaptation, Kind, Meta, Produces } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, InputWhereby, Whereby } from "./Types";

function toWhereby(input: InputWhereby): Whereby {
  const min = input.min === undefined ? undefined : toBound(input.min);
  const max = input.max === undefined ? undefined : toBound(input.max);

  if (min !== undefined && max !== undefined) {
    /**
     * `Date` stores a whole millisecond (`TimeClip`). Exclusive ends are
     * empty exactly when no integer ms remains, not when no float sits
     * between the stated instants — `new Date` would collapse those
     * floats back onto the excluded endpoint.
     */
    assertNonemptyDiscrete("T.date.whereby", epochBound(min), epochBound(max));
  }

  return input.distribution === undefined
    ? { min, max }
    : { min, max, distribution: input.distribution };
}

export default {
  /**
   * Keep `[Produces]` and `[Adaptation]` assigned here — see CLAUDE.md's
   * "declaration-emit trap." Both are optional and symbol-keyed, so this
   * top-level spread is the one place declaration emit needs them actually
   * written to have a name to print.
   */
  ...Schema({
    [Kind]: "date",
    [Meta]: {},
    [Produces]: undefined as unknown as Fabricated,
    [Adaptation]: undefined as unknown as Adaptations,
  }),

  whereby: (whereby: {
    min: InputBound<Date>;
    max: InputBound<Date>;
    distribution?: Distribution | undefined;
  }) => {
    return Schema({ [Kind]: "date", [Meta]: { whereby: toWhereby(whereby) } });
  },

  /** Any `Date` from the earliest representable instant up to the present moment. */
  past: {
    ...Schema({ [Kind]: "date", [Meta]: { mode: "past" } }),

    /**
     * A past `Date` drawn from `[min, now]`. `min` defaults to the earliest
     * representable instant. The implicit `now` end stays inclusive. Pass a
     * `distribution` to shape how values cluster within the range; without
     * one, every instant is equally likely.
     */
    whereby: (whereby: {
      min?: InputBound<Date> | undefined;
      distribution?: Distribution | undefined;
    }) =>
      Schema({
        [Kind]: "date",
        [Meta]: { mode: "past", whereby: toWhereby(whereby) },
      }),
  },

  /** Any `Date` from the present moment up to the latest representable instant. */
  future: {
    ...Schema({ [Kind]: "date", [Meta]: { mode: "future" } }),

    /**
     * A future `Date` drawn from `[now, max]`. `max` defaults to the latest
     * representable instant. The implicit `now` end stays inclusive. Pass a
     * `distribution` to shape how values cluster within the range; without
     * one, every instant is equally likely.
     */
    whereby: (whereby: {
      max?: InputBound<Date> | undefined;
      distribution?: Distribution | undefined;
    }) =>
      Schema({
        [Kind]: "date",
        [Meta]: { mode: "future", whereby: toWhereby(whereby) },
      }),
  },
};
