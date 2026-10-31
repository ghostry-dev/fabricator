import type { Adaptations } from "../../Adapter/Types";
import {
  assertNonemptyDiscrete,
  epochBound,
  toBound,
  type InputBound,
} from "../../Bound";
import { type Distribution } from "../../Distribution";
import { Adaptation, Kind, Meta, Produces, type Produced } from "../../Types";
import { unboundedEpoch } from "./Defaults";
import { Schema } from "./Schema";
import type { Fabricated, InputWhereby, Whereby } from "./Types";

type ThisRegistry = Schema<{}, Adaptations> & {
  /**
   * A `Date` drawn from `[min, max]`. Either end may be omitted: `min` defaults
   * to the earliest representable instant and `max` to the latest. Pass a
   * `distribution` to shape how values cluster within the range; without one,
   * every instant is equally likely.
   */
  whereby: (whereby: InputWhereby) => Schema<{ whereby: Whereby }>;

  /**
   * Any `Date` from the earliest representable instant up to the present
   * moment.
   */
  past: Schema<{ mode: "past" }> & {
    /**
     * A past `Date` drawn from `[min, now]`. `min` defaults to the earliest
     * representable instant. The implicit `now` end stays inclusive. Pass a
     * `distribution` to shape how values cluster within the range; without one,
     * every instant is equally likely.
     */
    whereby: (whereby: {
      min?: InputBound<Date> | undefined;
      distribution?: Distribution | undefined;
    }) => Schema<{ mode: "past"; whereby: Whereby }>;
  };

  /** Any `Date` from the present moment up to the latest representable instant. */
  future: Schema<{ mode: "future" }> & {
    /**
     * A future `Date` drawn from `[now, max]`. `max` defaults to the latest
     * representable instant. The implicit `now` end stays inclusive. Pass a
     * `distribution` to shape how values cluster within the range; without one,
     * every instant is equally likely.
     */
    whereby: (whereby: {
      max?: InputBound<Date> | undefined;
      distribution?: Distribution | undefined;
    }) => Schema<{ mode: "future"; whereby: Whereby }>;
  };
};

/**
 * A function, not the Schema itself: `Schema/Registry.ts` installs it as the
 * `T.date` getter, so every read is a distinct Schema. `past` and `future` are
 * getters for the same reason — see AGENTS.md's "Registry entries are
 * getters."
 */
function registry(): ThisRegistry {
  return {
    /**
     * Keep `[Produces]` and `[Adaptation]` assigned here — see AGENTS.md's
     * "declaration-emit trap." Both are optional and symbol-keyed, so this
     * top-level spread is the one place declaration emit needs them actually
     * written to have a name to print.
     */
    ...Schema({
      [Kind]: "date",
      [Meta]: {},
      [Produces]: undefined as unknown as Produced<Fabricated>,
      [Adaptation]: undefined as unknown as Adaptations,
    }),

    whereby: (whereby: InputWhereby) => {
      const converted = toWhereby(whereby);

      /**
       * `Date` stores a whole millisecond (`TimeClip`). Exclusive ends are
       * empty exactly when no integer ms remains, not when no float sits
       * between the stated instants — `new Date` would collapse those floats
       * back onto the excluded endpoint. An omitted end is judged against the
       * fabricate-time cap, so a one-sided exclusive end that leaves no instant
       * still fails here, not at `new Fabricator(...)`.
       */
      assertNonemptyDiscrete(
        "T.date.whereby",
        converted.min ? epochBound(converted.min) : unboundedEpoch.min,
        converted.max ? epochBound(converted.max) : unboundedEpoch.max,
      );

      return Schema({ [Kind]: "date", [Meta]: { whereby: converted } });
    },

    get past() {
      return {
        ...Schema({ [Kind]: "date", [Meta]: { mode: "past" } }),

        whereby: (whereby: {
          min?: InputBound<Date> | undefined;
          distribution?: Distribution | undefined;
        }) =>
          Schema({
            [Kind]: "date",
            [Meta]: { mode: "past", whereby: toWhereby(whereby) },
          }),
      };
    },

    get future() {
      return {
        ...Schema({ [Kind]: "date", [Meta]: { mode: "future" } }),

        whereby: (whereby: {
          max?: InputBound<Date> | undefined;
          distribution?: Distribution | undefined;
        }) =>
          Schema({
            [Kind]: "date",
            [Meta]: { mode: "future", whereby: toWhereby(whereby) },
          }),
      };
    },
  };
}

export default registry;

/**
 * Conversion only. Emptiness is checked by the bare `whereby` alone: `past` and
 * `future` close their range against the clock, which is not known until
 * `Fabricator.ts` builds them.
 */
function toWhereby(input: InputWhereby): Whereby {
  const min = input.min === undefined ? undefined : toBound(input.min);
  const max = input.max === undefined ? undefined : toBound(input.max);

  return input.distribution === undefined
    ? { min, max }
    : { min, max, distribution: input.distribution };
}
