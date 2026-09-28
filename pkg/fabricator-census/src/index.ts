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

export { census } from "./Census";

/**
 * Fit a distribution to any numeric tally in a census — the candidates core's
 * `sampler` can draw, scored against the observations the way core would
 * produce them.
 */
export { fit } from "./Fit/Fit";

/**
 * Turn a census into a suggestion tree — the builder and arguments for every
 * path — and render either as text.
 */
export { suggest } from "./Suggest";
export { report } from "./Report";

/**
 * Every failure this package raises. Extends core's `FabricatorError`, so one
 * `instanceof` check covers both packages.
 */
export { CensusError } from "./Error";

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
  SuggestedFormat,
  SuggestedLength,
  SuggestedValue,
  Suggestion,
  SuggestOptions,
  TypeCounts,
  Value,
} from "./Types";
