import type { Bound } from "../../Bound";

/**
 * Inclusive caps a missing `whereby` end draws against. Not stored on the
 * bare schema — `T.number` / `T.number.integer` carry no `whereby` until
 * one is named, and an omitted end stays omitted on `[Meta]`.
 */
export const unboundedContinuous: { min: Bound<number>; max: Bound<number> } = {
  min: { value: -Number.MAX_VALUE, exclusive: false },
  max: { value: Number.MAX_VALUE, exclusive: false },
};

/**
 * Inclusive caps a missing integer `whereby` end draws against. Same
 * fabricate-time fill as {@link unboundedContinuous}.
 */
export const unboundedDiscrete: { min: Bound<number>; max: Bound<number> } = {
  min: { value: -Number.MAX_SAFE_INTEGER, exclusive: false },
  max: { value: Number.MAX_SAFE_INTEGER, exclusive: false },
};
