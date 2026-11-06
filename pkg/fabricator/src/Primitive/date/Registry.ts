import type { Adaptations } from "../../Adapter/Types";
import { assertNonemptyDiscrete, epochBound, toBound } from "../../Bound";
import { Adaptation, Kind, Meta, Produces, type Produced } from "../../Types";
import { toRedraws, type Redraws } from "../../Unique/Strategy";
import { unboundedEpoch } from "./Defaults";
import { Schema } from "./Schema";
import type {
  Fabricated,
  InputFutureWhereby,
  InputPastWhereby,
  InputUniqueFutureWhereby,
  InputUniquePastWhereby,
  InputUniqueWhereby,
  InputWhereby,
  Whereby,
} from "./Types";

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
    whereby: (
      whereby: InputPastWhereby,
    ) => Schema<{ mode: "past"; whereby: Whereby }>;
  };

  /** Any `Date` from the present moment up to the latest representable instant. */
  future: Schema<{ mode: "future" }> & {
    /**
     * A future `Date` drawn from `[now, max]`. `max` defaults to the latest
     * representable instant. The implicit `now` end stays inclusive. Pass a
     * `distribution` to shape how values cluster within the range; without one,
     * every instant is equally likely.
     */
    whereby: (
      whereby: InputFutureWhereby,
    ) => Schema<{ mode: "future"; whereby: Whereby }>;
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

    whereby: (whereby: InputWhereby) =>
      Schema({
        [Kind]: "date",
        [Meta]: { whereby: toCheckedWhereby("T.date.whereby", whereby) },
      }),

    get past() {
      return {
        ...Schema({ [Kind]: "date", [Meta]: { mode: "past" } }),

        whereby: (whereby: InputPastWhereby) =>
          Schema({
            [Kind]: "date",
            [Meta]: { mode: "past", whereby: toWhereby(whereby) },
          }),
      };
    },

    get future() {
      return {
        ...Schema({ [Kind]: "date", [Meta]: { mode: "future" } }),

        whereby: (whereby: InputFutureWhereby) =>
          Schema({
            [Kind]: "date",
            [Meta]: { mode: "future", whereby: toWhereby(whereby) },
          }),
      };
    },
  };
}

export default registry;

type UniqueRegistry = Schema<{ unique: true }, Adaptations> & {
  /**
   * A `Date` the built Fabricator never repeats, drawn from `[min, max]` like
   * `T.date.whereby`. Instants are whole milliseconds, so a uniform range is
   * drawn as a random permutation of them: every instant exactly once, then
   * `UniqueExhaustedError`. A skewed range is tracked instead, still exhausting
   * exactly; `redraws` raises the cap on consecutive repeats its rarest
   * instants can need.
   */
  whereby: (
    whereby: InputUniqueWhereby,
  ) => Schema<{ unique: true; whereby: Whereby }>;

  /** A past `Date` the built Fabricator never repeats. */
  past: Schema<{ mode: "past"; unique: true }> & {
    whereby: (
      whereby: InputUniquePastWhereby,
    ) => Schema<{ mode: "past"; unique: true; whereby: Whereby }>;
  };

  /** A future `Date` the built Fabricator never repeats. */
  future: Schema<{ mode: "future"; unique: true }> & {
    whereby: (
      whereby: InputUniqueFutureWhereby,
    ) => Schema<{ mode: "future"; unique: true; whereby: Whereby }>;
  };
};

/**
 * `T.unique.date`, assembled into the namespace by `Primitive/unique`, which
 * installs it as a getter for the same reason `T.date` is one. `past` and
 * `future` are getters here too.
 */
export function unique(): UniqueRegistry {
  return {
    /** See {@link registry} on why both are assigned. */
    ...Schema({
      [Kind]: "date",
      [Meta]: { unique: true },
      [Produces]: undefined as unknown as Produced<Fabricated>,
      [Adaptation]: undefined as unknown as Adaptations,
    }),

    whereby: (whereby: InputUniqueWhereby) =>
      Schema({
        [Kind]: "date",
        [Meta]: {
          unique: true,
          whereby: withRedraws(
            "T.unique.date.whereby",
            toCheckedWhereby("T.unique.date.whereby", whereby),
            whereby,
          ),
        },
      }),

    get past() {
      return {
        ...Schema({ [Kind]: "date", [Meta]: { mode: "past", unique: true } }),

        whereby: (whereby: InputUniquePastWhereby) =>
          Schema({
            [Kind]: "date",
            [Meta]: {
              mode: "past",
              unique: true,
              whereby: withRedraws(
                "T.unique.date.past.whereby",
                toWhereby(whereby),
                whereby,
              ),
            },
          }),
      };
    },

    get future() {
      return {
        ...Schema({ [Kind]: "date", [Meta]: { mode: "future", unique: true } }),

        whereby: (whereby: InputUniqueFutureWhereby) =>
          Schema({
            [Kind]: "date",
            [Meta]: {
              mode: "future",
              unique: true,
              whereby: withRedraws(
                "T.unique.date.future.whereby",
                toWhereby(whereby),
                whereby,
              ),
            },
          }),
      };
    },
  };
}

/**
 * `toWhereby` plus the emptiness check a bare `whereby` gets. `Date` stores a
 * whole millisecond (`TimeClip`). Exclusive ends are empty exactly when no
 * integer ms remains, not when no float sits between the stated instants — `new
 * Date` would collapse those floats back onto the excluded endpoint. An omitted
 * end is judged against the fabricate-time cap, so a one-sided exclusive end
 * that leaves no instant still fails here, not at `new Fabricator(...)`.
 */
function toCheckedWhereby(label: string, input: InputWhereby): Whereby {
  const converted = toWhereby(input);

  assertNonemptyDiscrete(
    label,
    converted.min ? epochBound(converted.min) : unboundedEpoch.min,
    converted.max ? epochBound(converted.max) : unboundedEpoch.max,
  );

  return converted;
}

function withRedraws(label: string, whereby: Whereby, input: Redraws): Whereby {
  const redraws = toRedraws(label, input.redraws);
  return redraws === undefined ? whereby : { ...whereby, redraws };
}

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
