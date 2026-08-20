import { assertNonemptyDiscreteBigint, toBound } from "../../Bound";
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
      [Meta]: { whereby: toWhereby(whereby) },
    });
  },

  as: (
    produce: Produce<Fabricated>,
  ): Schema<{ produce: Produce<Fabricated> }> => {
    return Schema({ [Kind]: "bigint", [Meta]: { produce } });
  },
};

function toWhereby(input: InputWhereby): Whereby {
  const max = toBound(input.max);
  const min =
    input.min === undefined
      ? { value: -max.value, exclusive: false }
      : toBound(input.min);
  assertNonemptyDiscreteBigint("T.bigint.whereby", min, max);
  return { min, max };
}
