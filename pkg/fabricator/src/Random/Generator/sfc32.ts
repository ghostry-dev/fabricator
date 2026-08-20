import type { NumberGenerator } from "../Types";

/**
 * sfc32 ("Small Fast Counter"): a 128-bit-state PRNG that is fast, compact, and
 * statistically strong (passes both PractRand and TestU01 BigCrush). Each call
 * advances the state and returns the top 32 bits scaled into `[0, 1)`.
 * Non-cryptographic: never use this for secrets or tokens.
 *
 * @see https://stackoverflow.com/a/47593316
 */
export function sfc32(
  a: number,
  b: number,
  c: number,
  d: number,
): NumberGenerator {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
