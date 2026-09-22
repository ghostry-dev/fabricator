import type { Adaptations } from "../../Adapter/Types";
import type { InputLength, Length } from "../../Bound";
import type { Produce } from "../../Random/Types";
import type { Adaptation, Kind, Meta, Produces } from "../../Types";
import type { classes } from "./Constants";

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

export type Whereby = { length: Length; composition?: Composition };

export type Fabricated = string;

/**
 * JSON-Schema keywords that constrain a string value — carried as neutral,
 * schema-library-agnostic hints (see the builder's `as`). Adapters forward them
 * to their target: `toTypeBox` to `Type.String(...)`, a future `toZod` to
 * `z.string()` refinements, etc.
 *
 * Length lives on `whereby` as Bound pairs, which adapters forward as
 * `minLength`/`maxLength`; `hints` never duplicates it — these are the
 * orthogonal, non-length constraints.
 */
export type JsonSchema = { format?: string; pattern?: string };

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
  | { whereby: Whereby; hints?: JsonSchema | undefined; produce?: never }
  | {
      whereby?: Whereby;
      hints?: JsonSchema | undefined;
      produce: Produce<Fabricated>;
    };

export type Core<
  $Meta extends Meta = Meta,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "string";
  [Meta]: $Meta;
  readonly [Produces]?: Fabricated;
  readonly [Adaptation]?: $Adaptations;
};
