/**
 * The two outcomes an undefinable roll can land on. Also the key space
 * `.weighted(...)` weighs — see `Types.ts`'s `Weights`.
 *
 * Lives here rather than `Types.ts` so that file stays type-only (see
 * `boolean/Outcomes.ts`).
 */
export const outcomes = ["undefined", "value"] as const;
export type Outcome = (typeof outcomes)[number];
