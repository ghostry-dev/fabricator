import { assertNonemptyDiscreteBigint, toBigintBound } from "../../Bound";
import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, InputWhereby, Whereby } from "./Types";

export default {
  /**
   * The builder carries the primitive's `[Kind]` so it can be named directly as
   * a `compute` source — which derives its schema by kind — without first
   * satisfying a `whereby`.
   */
  [Kind]: "bigint" as const,

  whereby: (whereby: InputWhereby): Schema<{ whereby: Whereby }> => {
    return Schema({
      [Kind]: "bigint",
      [Meta]: { whereby: toWhereby("T.bigint.whereby", whereby) },
    });
  },

  as: (
    produce: Produce<Fabricated>,
  ): Schema<{ produce: Produce<Fabricated> }> => {
    return Schema({ [Kind]: "bigint", [Meta]: { produce } });
  },
};

type UniqueRegistry = {
  /** See the default export's `[Kind]`. */
  [Kind]: "bigint";

  /**
   * A bigint the built Fabricator never repeats, drawn from `[min, max]` like
   * `T.bigint.whereby`. The range is yielded as a random permutation at any
   * width, so it produces every value exactly once and the draw after the last
   * throws `UniqueExhaustedError`.
   */
  whereby: (
    whereby: InputWhereby,
  ) => Schema<{ whereby: Whereby; unique: true }>;
};

/**
 * `T.unique.bigint` (and `T.unique.number.integer.big`), assembled into the
 * namespace by `Primitive/unique`. No `as`: a producer replaces the draw, so it
 * would discard the one thing this builder adds.
 */
export const unique: UniqueRegistry = {
  [Kind]: "bigint",

  whereby: (
    whereby: InputWhereby,
  ): Schema<{ whereby: Whereby; unique: true }> =>
    Schema({
      [Kind]: "bigint",
      [Meta]: {
        whereby: toWhereby("T.unique.bigint.whereby", whereby),
        unique: true,
      },
    }),
};

function toWhereby(label: string, input: InputWhereby): Whereby {
  const max = toBigintBound(label, "max", input.max);
  const min =
    input.min === undefined
      ? { value: -max.value, exclusive: false }
      : toBigintBound(label, "min", input.min);
  assertNonemptyDiscreteBigint(label, min, max);
  return { min, max };
}
