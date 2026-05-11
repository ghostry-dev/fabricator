import type { CodepointRange } from "./Types";

/**
 * Unicode code point ranges for spanning the codespace — a fuzzing aid
 * for exercising input far outside ordinary text. Use a preset or build
 * an arbitrary inclusive range with `range(from, to)`.
 *
 * Lives here rather than `Types.ts` so that file stays type-only. A
 * value export alongside `export type Fabricated = string` makes the
 * module a value module, and `export * as string` in
 * `Primitive/namespace.ts` then resolves `string` to the namespace —
 * a cycle that drops `[Kind]`/`[Meta]` off `Core`.
 */
export const unicode = {
  /**
   * All Unicode scalar values: the codespace minus the surrogate block
   * (U+D800–U+DFFF). Always well-formed UTF-16, so it round-trips cleanly
   * through encoders, URLs, and datastores.
   *
   * This is the default composition for strings.
   */
  scalars: [
    { from: 0x0, to: 0xd7ff },
    { from: 0xe000, to: 0x10ffff },
  ],

  /**
   * The entire Unicode codespace, U+0000–U+10FFFF, including the surrogate
   * block — so it can yield lone surrogates and thus ill-formed UTF-16.
   * Opt in for lone surrogates and other ill-formed UTF-16 when fuzzing.
   */
  codespace: { from: 0x0, to: 0x10ffff },

  /** The Basic Multilingual Plane, U+0000–U+FFFF. */
  bmp: { from: 0x0, to: 0xffff },

  /** Printable ASCII, U+0020–U+007E. */
  ascii: { from: 0x20, to: 0x7e },

  /** An arbitrary inclusive code point range. */
  range: (from: number, to: number): CodepointRange => ({ from, to }),
};

/**
 * The built-in character classes as code point ranges, each an alias for
 * the code point ranges it spans. For use in the `[weight, source]` form
 * of `composition` (e.g. mixing a class with a Unicode range).
 */
export const classes: {
  lowercase: ReadonlyArray<CodepointRange>;
  uppercase: ReadonlyArray<CodepointRange>;
  digit: ReadonlyArray<CodepointRange>;
  symbol: ReadonlyArray<CodepointRange>;
  space: ReadonlyArray<CodepointRange>;
} = {
  lowercase: [{ from: 0x61, to: 0x7a }],
  uppercase: [{ from: 0x41, to: 0x5a }],
  digit: [{ from: 0x30, to: 0x39 }],
  symbol: [
    { from: 0x21, to: 0x2f },
    { from: 0x3a, to: 0x40 },
    { from: 0x5b, to: 0x60 },
    { from: 0x7b, to: 0x7e },
  ],
  space: [{ from: 0x20, to: 0x20 }],
};
