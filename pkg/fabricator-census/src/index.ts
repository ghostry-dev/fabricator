/**
 * `@ghostry/fabricator-census` — take a census of real data and read it back in
 * fabricator's own vocabulary: `Distribution` variants, `whereby` ranges,
 * `.weighted(...)` weights and string `composition`.
 *
 * The census and suggestion surface lives here; the PostgreSQL query helpers
 * are a separate entry point, `@ghostry/fabricator-census/postgres`, because
 * they are a different audience from a caller who already holds decoded rows.
 *
 * @module
 */

export { census } from "./Census.ts";

/**
 * Fit a distribution to any numeric tally in a census — the candidates core's
 * `sampler` can draw, scored against the observations the way core would
 * produce them.
 */
export { fit } from "./Fit/Fit.ts";

/**
 * Turn a census into a suggestion tree — the builder and arguments for every
 * path — and render either as text.
 */
export { suggest } from "./Suggest.ts";
export { report } from "./Report.ts";

/**
 * How many rows a census needs for its statistics to hold to a margin — the
 * number to sample, from a database or anywhere else.
 */
export {
  sampleSize,
  type SampleSize,
  type SampleSizeOptions,
  type SampleSizeReason,
} from "./SampleSize.ts";

/**
 * Whole-table facts about a column, as pushdown aggregates or planner
 * statistics report them.
 */
export type { BigIntFact, ColumnFacts, Facts, FactValue } from "./Facts.ts";

/**
 * Declared limits on a column — what it accepts rather than what it holds —
 * stated as a suggestion's `admits`.
 */
export type { ColumnLimits, Limits } from "./Limits.ts";

/**
 * Every failure this package raises. Extends core's `FabricatorError`, so one
 * `instanceof` check covers both packages.
 */
export { CensusError } from "./Error.ts";

/**
 * The census's own data shapes, so a caller storing, diffing or rendering one
 * can name what they hold.
 */
export type {
  Accumulator,
  ArrayTally,
  BigIntTally,
  BooleanTally,
  Census,
  CensusOptions,
  CharacterBucket,
  CharacterComposition,
  DateTally,
  Fit,
  FitCandidate,
  FitOptions,
  FitTarget,
  FittedDistribution,
  Field,
  Formats,
  Frequencies,
  Frequency,
  Histogram,
  Node,
  Numeric,
  ObjectTally,
  OtherBucket,
  Quantiles,
  ResolvedOptions,
  Sample,
  StringTally,
  Summary,
  DateSuggestion,
  Notes,
  SuggestedComposition,
  SuggestedEnds,
  SuggestedFormat,
  SuggestedLength,
  SuggestedValue,
  Suggestion,
  SuggestOptions,
  TypeCounts,
  Value,
} from "./Types.ts";
