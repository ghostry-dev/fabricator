import { toLengthRange } from "../../Bound";
import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import { toRedraws } from "../../Unique/Strategy";
import { Schema } from "./Schema";
import type {
  Fabricated,
  InputUniqueWhereby,
  InputWhereby,
  JsonSchema,
  Whereby,
} from "./Types";

export default {
  /**
   * The builder carries the primitive's `[Kind]` so it can be named directly as
   * a `compute` source — which derives its schema by kind — without first
   * satisfying a `whereby`.
   */
  [Kind]: "string" as const,

  /**
   * Derive a custom string type: a `string` Schema whose production is
   * `produce`, optionally tagged with a `format` hint that schema exporters
   * (e.g. `toTypeBox`) read.
   */
  as: (
    produce: Produce<Fabricated>,
    hints?: JsonSchema,
  ): Schema<{
    produce: Produce<Fabricated>;
    hints: JsonSchema | undefined;
  }> => {
    return Schema({ [Kind]: "string", [Meta]: { produce, hints } });
  },

  /**
   * A string of `length` UTF-16 code units. `length` is a bare `N` (exactly N)
   * or `{ min?, max, distribution? }`. `min` defaults to inclusive 0. Exclusive
   * ends use a Bound object. A bare `N` is stored as min = max = N inclusive
   * and carries no distribution. Without `distribution`, the length is drawn
   * uniformly across the inclusive interval; `distribution` shapes that draw
   * the same way it does for `T.number.integer`.
   *
   * Pass `composition` to control which characters appear and in what
   * proportion; without one, characters span all Unicode scalar values (the
   * codespace minus surrogates, so always well-formed UTF-16). The result's
   * `.length` equals the chosen length exactly. When the composition cannot
   * fill the final code units — e.g. only astral, two-unit characters remain
   * for a one-unit gap — the gap is topped up with a well-formed BMP character
   * outside the requested `composition`, inserted at a random character
   * boundary.
   */
  whereby: (whereby: InputWhereby): Schema<{ whereby: Whereby }> => {
    return Schema({
      [Kind]: "string",
      [Meta]: { whereby: toWhereby("T.string.whereby", whereby) },
    });
  },
};

/**
 * `T.unique.string`, assembled into the namespace by `Primitive/unique`. No
 * `as`: a producer replaces the draw, so it would discard the one thing this
 * builder adds.
 */
export const unique = {
  /** See the default export's `[Kind]`. */
  [Kind]: "string" as const,

  /**
   * A string the built Fabricator never repeats, drawn like `T.string.whereby`.
   * Each draw is redrawn while it matches one already produced, up to `redraws`
   * times in a row; a length and composition that can spell only a few strings
   * run out through that cap, as `UniqueRedrawsError`.
   */
  whereby: (
    whereby: InputUniqueWhereby,
  ): Schema<{ whereby: Whereby; unique: true }> => {
    const label = "T.unique.string.whereby";
    const converted = toWhereby(label, whereby);
    const redraws = toRedraws(label, whereby.redraws);

    return Schema({
      [Kind]: "string",
      [Meta]: {
        whereby: redraws === undefined ? converted : { ...converted, redraws },
        unique: true,
      },
    });
  },
};

function toWhereby(label: string, input: InputWhereby): Whereby {
  return {
    length: toLengthRange(input.length, label),
    ...(input.composition === undefined
      ? {}
      : { composition: input.composition }),
  };
}
