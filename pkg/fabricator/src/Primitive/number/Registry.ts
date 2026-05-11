import type { Adaptations } from "../../Adapter/Types";
import {
  assertNonemptyContinuous,
  assertNonemptyDiscrete,
  toBound,
} from "../../Bound";
import { Adaptation, Kind, Meta, Produces } from "../../Types";
import { default as bigint } from "../bigint";
import { unboundedContinuous, unboundedDiscrete } from "./defaults";
import { Schema } from "./Schema";
import type { Fabricated, InputWhereby, Whereby } from "./Types";

function toWhereby(input: InputWhereby, integer: boolean): Whereby {
  const min = input.min === undefined ? undefined : toBound(input.min);
  const max = input.max === undefined ? undefined : toBound(input.max);
  const defaults = integer ? unboundedDiscrete : unboundedContinuous;
  const label = integer ? "T.number.integer.whereby" : "T.number.whereby";

  /**
   * An omitted end is not stored — same as `T.date` — but emptiness is
   * judged against the fabricate-time cap so a one-sided exclusive end
   * that leaves no value still fails at `.whereby()`, not first
   * `fabricate()`.
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

export default {
  /**
   * Keep `[Produces]` and `[Adaptation]` assigned here — see CLAUDE.md's
   * "declaration-emit trap." Both are optional and symbol-keyed, so this
   * top-level spread is the one place declaration emit needs them actually
   * written to have a name to print.
   */
  ...Schema({
    [Kind]: "number",
    [Meta]: {},
    [Produces]: undefined as unknown as Fabricated,
    [Adaptation]: undefined as unknown as Adaptations,
  }),

  whereby: (whereby: InputWhereby) =>
    Schema({
      [Kind]: "number",
      [Meta]: { whereby: toWhereby(whereby, false) },
    }),

  integer: {
    ...Schema({ [Kind]: "number", [Meta]: { integer: true } }),

    whereby: (whereby: InputWhereby) =>
      Schema({
        [Kind]: "number",
        [Meta]: { integer: true, whereby: toWhereby(whereby, true) },
      }),

    /**
     * A monotonically increasing counter starting at 1, fresh per `construct()`.
     */
    sequence: Schema({
      [Kind]: "number",
      [Meta]: { sequence: true, integer: true },
    }),

    big: bigint,
  },
};
