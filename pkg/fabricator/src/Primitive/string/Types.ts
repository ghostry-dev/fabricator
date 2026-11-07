import type { Adaptations } from "../../Adapter/Types";
import type {
  AdmittedEnds,
  InputAdmittedEnds,
  InputLength,
  Length,
} from "../../Bound";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produced, Produces } from "../../Types";
import type { classes } from "./Constants";
import type { Redraws } from "../../Unique/Strategy";

/** An inclusive range of Unicode code points. */
export type CodepointRange = { from: number; to: number };

/**
 * The single mechanism every character is drawn from: one or more code point
 * ranges. A literal string is accepted as shorthand for the ranges of its
 * individual characters, so custom pools, the built-in classes, and the Unicode
 * codespace are all the same thing under the hood.
 */
export type CharacterSource =
  | string
  | CodepointRange
  | ReadonlyArray<CodepointRange>;

export type CharacterClass = keyof typeof classes;

/**
 * How a string's characters should be composed: a weighting over the built-in
 * classes by name, or explicit `[weight, source]` pairs over arbitrary
 * character sources. Each character independently picks a source by weight,
 * then a code point uniformly across that source's ranges — so the weights
 * describe expected composition, not per-character uniformity.
 */
export type Composition =
  | Partial<Record<CharacterClass, number>>
  | ReadonlyArray<[number, CharacterSource]>;

export type InputWhereby = { length: InputLength; composition?: Composition };

/** `T.unique.string`'s `.whereby`: the same input, plus {@link Redraws}. */
export type InputUniqueWhereby = InputWhereby & Redraws;

/** `redraws` is set only through {@link InputUniqueWhereby}. */
export type Whereby = {
  length: Length;
  composition?: Composition;
  redraws?: number | undefined;
};

/**
 * `.admits(...)`'s input: the length an adapter states, widening what `whereby`
 * draws. An end is replaced, `Infinity` (or `-Infinity` for `min`) states no
 * limit, and an omitted end keeps what is admitted already.
 */
export type InputAdmits = {
  length?: InputAdmittedEnds<number> | undefined;
} & Keywords;

/**
 * JSON-Schema keywords for what the strings are, which adapters forward to
 * their target: `toTypeBox` to `Type.String(...)`, a future `toZod` to
 * `z.string()` refinements. Unlike a length they are not checked against what
 * is drawn — like `.adapt`, the caller vouches that fabricated values match,
 * usually by fabricating through `.as(produce)`. A keyword left out keeps what
 * is admitted already.
 */
export type Keywords = {
  format?: string | undefined;
  pattern?: string | undefined;
};

/**
 * `[Meta].admits`, set only by `.admits(...)` and complete once set: an absent
 * end states no limit (`Admits.ts`'s `toAdmits`).
 */
export type Admits = { length: AdmittedEnds<number> } & Keywords;

export type Fabricated = string;

/**
 * A length and optional composition, drawn via `whereby`. There is no natural
 * bound to fuzz a string to, so unlike `number`/`date` the builder itself has
 * no bare form. `length` does: a bare count, or `{ min?, max, distribution? }`
 * — the same {@link InputLength} `array` uses. Optionally overridden by an
 * opaque `as` production, carried alongside `whereby` rather than replacing it
 * (when `whereby` was already set) so a prior length/composition survives `as`
 * for future validation.
 */
export type Meta =
  | {
      whereby: Whereby;
      admits?: Admits | undefined;
      unique?: true;
      produce?: never;
    }
  | {
      whereby?: Whereby;
      admits?: Admits | undefined;
      unique?: true;
      produce: Produce<Fabricated>;
    };

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "string";
  [Meta]: $Meta;
  readonly [Produces]?: Produced<Fabricated>;
  readonly [Adaptation]?: $Adaptations;
};
