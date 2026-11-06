import type { Adaptations } from "../../Adapter/Types";
import {
  assertNonemptyContinuous,
  assertNonemptyDiscrete,
  toBound,
} from "../../Bound";
import { Adaptation, Kind, Meta, Produces, type Produced } from "../../Types";
import { toRedraws } from "../../Unique/Strategy";
import { default as bigint } from "../bigint";
import { unique as uniqueBigint } from "../bigint/Registry";
import { unboundedContinuous, unboundedDiscrete } from "./Defaults";
import { Schema } from "./Schema";
import type {
  Fabricated,
  InputUniqueWhereby,
  InputWhereby,
  Whereby,
} from "./Types";

type ThisRegistry = Schema<{}, Adaptations> & {
  /**
   * A `number` drawn from `[min, max]`, either end optional. Pass a
   * `distribution` to shape how values cluster within the range; without one,
   * every value is equally likely.
   */
  whereby: (whereby: InputWhereby) => Schema<{ whereby: Whereby }>;

  /** The same surface, restricted to integers. */
  integer: Schema<{ integer: true }> & {
    whereby: (
      whereby: InputWhereby,
    ) => Schema<{ integer: true; whereby: Whereby }>;

    /**
     * A monotonically increasing counter starting at 1, fresh per
     * `construct()`.
     */
    sequence: Schema<{ sequence: true; integer: true }>;

    big: typeof bigint;
  };
};

/**
 * A function, not the Schema itself: `Schema/Registry.ts` installs it as the
 * `T.number` getter, so every read is a distinct Schema. `integer` and
 * `integer.sequence` are getters for the same reason; `big` is a builder, not a
 * Schema, so it stays a plain property — see AGENTS.md's "Registry entries are
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
      [Kind]: "number",
      [Meta]: {},
      [Produces]: undefined as unknown as Produced<Fabricated>,
      [Adaptation]: undefined as unknown as Adaptations,
    }),

    whereby: (whereby: InputWhereby) =>
      Schema({
        [Kind]: "number",
        [Meta]: { whereby: toWhereby("T.number", whereby, false) },
      }),

    get integer() {
      return {
        ...Schema({ [Kind]: "number", [Meta]: { integer: true } }),

        whereby: (whereby: InputWhereby) =>
          Schema({
            [Kind]: "number",
            [Meta]: {
              integer: true,
              whereby: toWhereby("T.number", whereby, true),
            },
          }),

        get sequence() {
          return Schema({
            [Kind]: "number",
            [Meta]: { sequence: true, integer: true },
          });
        },

        big: bigint,
      };
    },
  };
}

export default registry;

type UniqueRegistry = Schema<{ unique: true }, Adaptations> & {
  /**
   * A `number` that the built Fabricator never repeats, drawn from `[min, max]`
   * like `T.number.whereby`. Values are tracked as they are drawn, so memory
   * grows with the values produced. A continuous range repeats only by chance,
   * which makes this mostly a guard; a range whose ends meet holds one value,
   * and the draw after it throws `UniqueExhaustedError`.
   */
  whereby: (
    whereby: InputUniqueWhereby,
  ) => Schema<{ unique: true; whereby: Whereby }>;

  /**
   * Integers the built Fabricator never repeats. A uniform range is drawn as a
   * random permutation, so it yields every value exactly once and the draw
   * after the last throws `UniqueExhaustedError`. A skewed or unbounded range
   * is tracked instead, still exhausting exactly when bounded. A skewed range's
   * rarest values can take many draws to find; `redraws` raises the cap on
   * consecutive repeats for that.
   */
  integer: Schema<{ integer: true; unique: true }> & {
    whereby: (
      whereby: InputUniqueWhereby,
    ) => Schema<{ integer: true; unique: true; whereby: Whereby }>;

    big: typeof uniqueBigint;
  };
};

/**
 * `T.unique.number`, assembled into the namespace by `Primitive/unique`, which
 * installs it as a getter for the same reason `T.number` is one. Mirrors
 * {@link registry} without `integer.sequence`, which already never repeats.
 */
export function unique(): UniqueRegistry {
  return {
    /** See {@link registry} on why both are assigned. */
    ...Schema({
      [Kind]: "number",
      [Meta]: { unique: true },
      [Produces]: undefined as unknown as Produced<Fabricated>,
      [Adaptation]: undefined as unknown as Adaptations,
    }),

    whereby: (whereby: InputUniqueWhereby) =>
      Schema({
        [Kind]: "number",
        [Meta]: {
          unique: true,
          whereby: toUniqueWhereby("T.unique.number", whereby, false),
        },
      }),

    get integer() {
      return {
        ...Schema({
          [Kind]: "number",
          [Meta]: { integer: true, unique: true },
        }),

        whereby: (whereby: InputUniqueWhereby) =>
          Schema({
            [Kind]: "number",
            [Meta]: {
              integer: true,
              unique: true,
              whereby: toUniqueWhereby("T.unique.number", whereby, true),
            },
          }),

        big: uniqueBigint,
      };
    },
  };
}

function toUniqueWhereby(
  prefix: string,
  input: InputUniqueWhereby,
  integer: boolean,
): Whereby {
  const label = integer ? `${prefix}.integer.whereby` : `${prefix}.whereby`;
  const whereby = toWhereby(prefix, input, integer);
  const redraws = toRedraws(label, input.redraws);
  return redraws === undefined ? whereby : { ...whereby, redraws };
}

function toWhereby(
  prefix: string,
  input: InputWhereby,
  integer: boolean,
): Whereby {
  const min = input.min === undefined ? undefined : toBound(input.min);
  const max = input.max === undefined ? undefined : toBound(input.max);
  const defaults = integer ? unboundedDiscrete : unboundedContinuous;
  const label = integer ? `${prefix}.integer.whereby` : `${prefix}.whereby`;

  /**
   * An omitted end is not stored — same as `T.date` — but emptiness is judged
   * against the fabricate-time cap so a one-sided exclusive end that leaves no
   * value still fails at `.whereby()`, not first `fabricate()`.
   */
  if (integer) {
    assertNonemptyDiscrete(label, min ?? defaults.min, max ?? defaults.max);
  } else {
    assertNonemptyContinuous(label, min ?? defaults.min, max ?? defaults.max);
  }

  return input.distribution === undefined
    ? { min, max }
    : { min, max, distribution: input.distribution };
}
