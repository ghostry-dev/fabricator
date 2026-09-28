import type { CharacterClass, CodepointRange } from "@ghostry/fabricator";

/**
 * How a census is taken. Every count-valued option is a memory or resolution
 * bound; the defaults suit a sample of a few thousand to a few hundred thousand
 * rows.
 */
export type CensusOptions = {
  /**
   * Values kept per numeric tally for quantiles, histograms and fits. Up to
   * this many, every value is kept and those statistics are exact; past it, a
   * uniform reservoir sample stands in. Defaults to `10_000`.
   */
  reservoir?: number | undefined;

  /**
   * Distinct values a frequency tally tracks before it saturates. A saturated
   * tally reports only a lower bound on its distinct count and drops its
   * values, so a high-cardinality field never emits them. Defaults to `256`.
   */
  distinct?: number | undefined;

  /**
   * Distinct keys an object node tracks as separate fields. Past it, the node
   * switches to record mode: every value merges into one `value` node, so data
   * keyed by id or locale cannot grow the census without bound. Defaults to
   * `256`.
   */
  fields?: number | undefined;

  /**
   * Nesting levels descended into. A node at this depth still counts the types
   * it sees, but does not descend into arrays or objects, so recursive data
   * (trees, threads) cannot grow the census without bound. Defaults to `16`.
   */
  depth?: number | undefined;

  /** Histogram bins per numeric summary. Defaults to `20`. */
  bins?: number | undefined;

  /**
   * Evenly spaced quantiles kept per numeric summary as `sample.points` — the
   * empirical distribution a fit is scored against, at a resolution of `1 /
   * (points - 1)` in probability. Defaults to `1001`.
   */
  points?: number | undefined;

  /**
   * Makes reservoir sampling reproducible for a given input order. Each tally
   * draws from its own stream keyed by its path, so adding a field leaves every
   * other field's sample unchanged. Omitted, a fresh seed is drawn per census.
   */
  seed?: string | undefined;
};

/** {@link CensusOptions} with every default applied, as recorded on a census. */
export type ResolvedOptions = {
  reservoir: number;
  distinct: number;
  fields: number;
  depth: number;
  bins: number;
  points: number;
  seed: string | null;
};

/**
 * An incremental census. The caller owns iteration, so values may arrive from a
 * synchronous or asynchronous source, in one batch or several.
 */
export type Accumulator = {
  /** Tally one top-level value. Throws once `finish` has been called. */
  add(value: unknown): void;

  /**
   * The census of every value added so far. Calling it again returns the same
   * snapshot.
   */
  finish(): Census;
};

/**
 * The result of a census: plain data, safe to `JSON.stringify` and parse back
 * unchanged. Values that JSON cannot carry (bigints, Dates) are tagged — see
 * {@link Value}.
 */
export type Census = { options: ResolvedOptions; root: Node };

/**
 * What was observed at one position in the data. A tally for a type is present
 * only when that type was seen here.
 */
export type Node = {
  /** Values observed at this position. */
  count: number;
  types: TypeCounts;

  /**
   * Arrays and objects counted but not descended into, because this node sits
   * at the `depth` limit.
   */
  truncated: number;

  number: Numeric | null;
  string: StringTally | null;
  boolean: BooleanTally | null;
  bigint: BigIntTally | null;
  date: DateTally | null;
  array: ArrayTally | null;
  object: ObjectTally | null;
};

/**
 * Observations per type. `object` counts plain objects only; a class instance,
 * `Map`, `Set`, typed array, symbol or function counts as `other`.
 */
export type TypeCounts = {
  number: number;
  string: number;
  boolean: number;
  bigint: number;
  date: number;
  null: number;
  undefined: number;
  array: number;
  object: number;
  other: number;
};

/**
 * A tally of numbers — number values themselves, and every derived count or
 * instant (string and array lengths, object sizes, epoch milliseconds).
 */
export type Numeric = {
  /** Numbers tallied, finite or not. */
  count: number;
  finite: number;
  nan: number;
  positiveInfinity: number;
  negativeInfinity: number;

  /** `-0`s among the finite values; they enter the summary as `0`. */
  negativeZero: number;

  /** At least one finite value was seen, and every one was whole. */
  integer: boolean;

  /**
   * In input order, the values were exactly `1, 2, 3, …`, with nothing
   * non-finite among them. Meaningful only when the input was complete and
   * ordered; a random sample is neither.
   */
  consecutive: boolean;

  /** Present when at least one finite value was seen. */
  summary: Summary | null;
  frequencies: Frequencies;
};

/**
 * Statistics over the finite values. `min`, `max` and the moments are exact
 * over every value; quantiles, histogram and points come from the reservoir,
 * and are exact when `sample.exact` is.
 */
export type Summary = {
  min: number;
  max: number;
  mean: number;

  /** Sample standard deviation; `0` for a single value. */
  stddev: number;

  /** Population skewness; `0` when every value is equal. */
  skewness: number;
  quantiles: Quantiles;
  histogram: Histogram;
  sample: Sample;
};

export type Quantiles = {
  p1: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
};

/**
 * Equal-width bins over `[min, max]`. For integer data `max` is one past the
 * largest value, the interval core's `discreteSampler` draws over, with at most
 * one bin per integer. `counts` are reservoir counts; divide by `sample.size`
 * for proportions.
 */
export type Histogram = { min: number; max: number; counts: number[] };

export type Sample = {
  /** Values the quantiles, histogram and points were computed from. */
  size: number;

  /** Whether `size` is every finite value, rather than a reservoir sample. */
  exact: boolean;

  /**
   * Evenly spaced quantiles of the sample, from its minimum to its maximum, or
   * the whole sorted sample when it is smaller than `points`.
   */
  points: number[];
};

/**
 * Distinct values and how often each occurred, until `distinct` values have
 * been seen.
 */
export type Frequencies = {
  /**
   * Distinct values seen. A lower bound, `distinct + 1`, once `saturated`.
   */
  distinct: number;
  saturated: boolean;

  /** Values seen exactly once; `null` once `saturated`. */
  singletons: number | null;

  /**
   * Every distinct value with its count, most frequent first; `null` once
   * `saturated`.
   */
  top: Frequency[] | null;
};

export type Frequency = { value: Value; count: number };

/**
 * An observed value as census data. Bigints and Dates are tagged so a census
 * survives `JSON.stringify`: a bigint as its decimal string, a Date as its ISO
 * string.
 */
export type Value =
  | string
  | number
  | { type: "bigint"; value: string }
  | { type: "date"; value: string };

export type StringTally = {
  count: number;

  /** Lengths in UTF-16 code units, the unit core's string length budgets. */
  length: Numeric;
  composition: CharacterComposition;
  frequencies: Frequencies;
  formats: Formats;

  /**
   * Epoch milliseconds of the strings that parsed as ISO dates or date-times;
   * `null` when none did.
   */
  epoch: Numeric | null;
};

/**
 * Where a code point falls: one of core's built-in `classes`, or a coarse range
 * outside them. `control` is the ASCII controls, `latin1` U+0080–U+00FF, `bmp`
 * the rest of the Basic Multilingual Plane, `astral` everything above it, and
 * `surrogate` an unpaired surrogate.
 */
export type CharacterBucket =
  | CharacterClass
  | "control"
  | "latin1"
  | "bmp"
  | "astral"
  | "surrogate";

export type OtherBucket = Exclude<CharacterBucket, CharacterClass>;

export type CharacterComposition = {
  /** Code points observed per bucket, across every string. */
  counts: Record<CharacterBucket, number>;

  /**
   * The lowest and highest code point observed in each bucket outside core's
   * classes, so it can become a `CharacterSource` range; `null` when none was.
   */
  ranges: Record<OtherBucket, CodepointRange | null>;
};

/** Strings matching each recognized format. */
export type Formats = {
  /** `YYYY-MM-DD`. */
  date: number;

  /** `YYYY-MM-DD` then a time, `T` or space separated, with optional offset. */
  dateTime: number;

  /**
   * Date-times among `dateTime` with neither `Z` nor an offset, which
   * `Date.parse` reads as local time.
   */
  offsetless: number;
  uuid: number;
  email: number;
  url: number;

  /** A decimal number written as a string, as drivers return `numeric`. */
  numeric: number;
};

export type BooleanTally = { true: number; false: number };

export type BigIntTally = {
  count: number;

  /** Decimal strings, since JSON cannot carry a bigint. */
  min: string;
  max: string;
  frequencies: Frequencies;
};

export type DateTally = {
  count: number;

  /** Dates whose time value is `NaN`; they are not in `epoch`. */
  invalid: number;

  /** Epoch milliseconds of the valid dates. */
  epoch: Numeric;
};

export type ArrayTally = {
  count: number;
  length: Numeric;

  /** Every element of every array, holes as `undefined`. */
  element: Node;
};

export type ObjectTally = {
  count: number;

  /** Own enumerable string keys per object. */
  size: Numeric;

  /** Every key observed, across every object. */
  keys: StringTally;

  /**
   * Whether this node passed the `fields` limit and switched to record mode. In
   * record mode `fields` is `null` and `value` holds every value; before it,
   * `fields` holds one entry per key and `value` is `null`.
   */
  record: boolean;
  fields: Field[] | null;
  value: Node | null;
};

/**
 * One key of an object node. `present + absent` is the node's object count; a
 * key present with the value `undefined` is present, and counted in
 * `node.types.undefined`.
 */
export type Field = {
  key: string;
  present: number;
  absent: number;
  node: Node;
};

/**
 * A fitted candidate as the `distribution` core's `whereby` takes — every
 * parameter explicit, and never `custom` or `multi`, so a fit stays plain data.
 * Assignable to core's `Distribution`.
 */
export type FittedDistribution =
  | { kind: "uniform" }
  | { kind: "normal"; mean: number; spread: number }
  | { kind: "skew"; exponent: number }
  | { kind: "triangular"; mode: number }
  | { kind: "logarithmic" };

/**
 * Which of core's draws a fit models. `continuous` is `sampler` over `[min,
 * max]` (`T.number`, `T.date` on epoch milliseconds); `discrete` is
 * `discreteSampler`, a draw over `[min, max + 1)` floored to an integer
 * (`T.number.integer`, string and array `length`).
 */
export type FitTarget = "continuous" | "discrete";

export type FitCandidate = {
  distribution: FittedDistribution;

  /** Free parameters the candidate fitted. */
  parameters: number;

  /**
   * Distance between the observed and fitted CDFs: KS for a continuous target,
   * the largest gap at integer boundaries for a discrete one. Comparable only
   * between candidates of one fit — every candidate's parameters were estimated
   * from the same data, so the absolute value is not a test statistic
   * (Lilliefors).
   */
  score: number;
};

/**
 * The best distribution for a numeric tally, with every candidate it was chosen
 * from.
 */
export type Fit = {
  target: FitTarget;

  /**
   * The inclusive range `whereby` takes. For a discrete target, the fitted
   * `distribution`'s positional parameters (`mean`, `mode`) lie on the `[min,
   * max + 1)` axis `discreteSampler` draws on, which is what `whereby`
   * expects.
   */
  min: number;
  max: number;
  distribution: FittedDistribution;
  score: number;

  /**
   * Observations the scores were computed from; `1.36 / √n` is the KS critical
   * value at α ≈ 0.05.
   */
  n: number;

  /**
   * How close two scores must be for the one with fewer parameters to win —
   * `1.36 / √n`. A difference smaller than this is not one the data can tell
   * apart.
   */
  threshold: number;

  /** Every candidate tried, best score first. */
  candidates: FitCandidate[];
};

/** How a numeric tally is fitted. */
export type FitOptions = {
  /**
   * Fit a discrete target rather than a continuous one. Defaults to the tally's
   * own `integer` flag — pass `false` for epoch milliseconds, which are whole
   * but drawn continuously by `T.date`.
   */
  discrete?: boolean | undefined;
};

/** How a census is turned into suggestions. */
export type SuggestOptions = {
  /**
   * Least average observations per distinct value for a field to read as an
   * enum. Without it, ten rows of ten distinct names would look like one.
   * Defaults to `5`.
   */
  enumSupport?: number | undefined;

  /**
   * Greatest share of observations that may be values seen only once for a
   * field to read as an enum. Defaults to `0.05`.
   */
  enumSingletons?: number | undefined;

  /**
   * Share of a string field's values that must match a format for the format to
   * be suggested. Defaults to `0.95`.
   */
  formatRate?: number | undefined;

  /**
   * Distinct keys past which an object whose values all share one type is
   * flagged as probably a record. Defaults to `32`.
   */
  recordKeys?: number | undefined;
};

/**
 * A value a suggestion fixes: any census {@link Value}, a boolean, or one of the
 * non-finite numbers JSON cannot carry.
 */
export type SuggestedValue =
  | Value
  | boolean
  | { type: "number"; value: "NaN" | "Infinity" | "-Infinity" };

/**
 * A `length` for `T.string`/`T.array`'s `whereby`: a bare count when every
 * observed length was equal, otherwise a fitted range. Assignable to core's
 * `InputLength`.
 */
export type SuggestedLength =
  | number
  | { min: number; max: number; distribution: FittedDistribution };

/**
 * A `composition` for `T.string`'s `whereby`: the class-weighting form when
 * only core's classes occurred, otherwise `[weight, source]` pairs whose
 * sources are the classes' own ranges and the observed ranges outside them.
 * Assignable to core's `Composition`.
 */
export type SuggestedComposition =
  | Partial<Record<CharacterClass, number>>
  | Array<[number, CodepointRange | ReadonlyArray<CodepointRange>]>;

/** A string format with a known builder elsewhere. */
export type SuggestedFormat = "uuid" | "email" | "url" | "numeric";

/** A date range as ISO strings, since JSON cannot carry a `Date`. */
export type DateSuggestion = {
  kind: "date";
  whereby: {
    min: string;
    max: string;
    distribution: FittedDistribution | null;
  };
  fit: Fit | null;
  notes: string[];
};

/**
 * What to write for one position in the data, as a tagged tree mirroring core's
 * kinds: each variant names the builder it stands for, and carries the
 * arguments that builder takes. Plain data, not a built Schema and not source
 * text, so it serializes and a code generator can be layered on later.
 *
 * Weights are raw observed counts — core's weights are relative. A wrapper's
 * weights count only what reached it: an inner `nullable` under an `omittable`
 * is weighted over present values alone.
 */
export type Suggestion =
  | ({ kind: "sequence" } & Notes)
  | ({ kind: "always"; value: SuggestedValue } & Notes)
  | ({ kind: "null" } & Notes)
  | ({ kind: "undefined" } & Notes)
  | ({
      kind: "number";
      integer: boolean;
      whereby: { min: number; max: number; distribution: FittedDistribution };
      fit: Fit;
    } & Notes)
  | ({ kind: "enum"; items: Array<[number, SuggestedValue]> } & Notes)
  | ({
      kind: "string";
      whereby: { length: SuggestedLength; composition?: SuggestedComposition };
      fit: Fit | null;
      format: SuggestedFormat | null;
    } & Notes)
  | ({
      kind: "derive";
      from: DateSuggestion;

      /**
       * `isoDateTime` is `toISOString()`; `isoDate` is its first ten
       * characters.
       */
      resolve: "isoDateTime" | "isoDate";
    } & Notes)
  | ({ kind: "boolean"; weights: { true: number; false: number } } & Notes)
  | ({ kind: "bigint"; whereby: { min: string; max: string } } & Notes)
  | DateSuggestion
  | ({
      kind: "array";
      whereby: { length: SuggestedLength };
      fit: Fit | null;
      element: Suggestion;
    } & Notes)
  | ({
      kind: "object";
      fields: Array<{ key: string; value: Suggestion }>;
    } & Notes)
  | ({
      kind: "record";
      key: Suggestion;
      value: Suggestion;
      whereby: { size: { max: number; minTried: number } };
    } & Notes)
  | ({ kind: "choice"; options: Array<[number, Suggestion]> } & Notes)
  | ({
      kind: "nullable";
      weights: { null: number; value: number };
      inner: Suggestion;
    } & Notes)
  | ({
      kind: "nullish";
      weights: { null: number; undefined: number; value: number };
      inner: Suggestion;
    } & Notes)
  | ({
      kind: "undefinable";
      weights: { undefined: number; value: number };
      inner: Suggestion;
    } & Notes)
  | ({
      kind: "omittable";
      weights: { omitted: number; value: number };
      inner: Suggestion;
    } & Notes)
  | ({
      kind: "optional";
      weights: { omitted: number; undefined: number; value: number };
      inner: Suggestion;
    } & Notes)
  | ({ kind: "opaque" } & Notes);

/** What a suggestion could not express, or the reader should check. */
export type Notes = { notes: string[] };
