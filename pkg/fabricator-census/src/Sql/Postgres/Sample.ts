/**
 * Sampling queries: rows for a census, drawn so their count lands near a target
 * without a `LIMIT` — truncating a scan favors whichever rows it reaches
 * first.
 *
 * @module
 */

import { CensusError } from "../../Error";
import { Parameters, qualify, quote } from "../Quote";
import type { Query, Row, Table } from "../Types";

/** What every sampling method takes. */
type Common = {
  /** Rows wanted — typically `sampleSize({ population }).n`. */
  n: number;

  /** Rows in the table — typically `estimate(table)`'s result. */
  population: number;

  /** Columns to select; every column when omitted. */
  columns?: ReadonlyArray<string> | undefined;

  /**
   * Raw SQL for a `WHERE` condition. The one option that is not quoted or
   * parameterized — pass only trusted text, and no `$x` placeholders.
   */
  where?: string | undefined;
};

/**
 * Keeps each row independently: an unbiased sample that still reads every page.
 * The default when `method` is omitted.
 */
export type BernoulliSample = Common & {
  method?: "bernoulli" | undefined;

  /**
   * `REPEATABLE`'s seed. Reproduces the sample only while the table's physical
   * layout is unchanged.
   */
  seed?: number | undefined;

  key?: never;
};

/**
 * Keeps whole pages: fast on a huge table, but biased wherever physical order
 * tracks the values.
 */
export type SystemSample = Common & {
  method: "system";

  /** `REPEATABLE`'s seed, holding as long as the physical layout does. */
  seed?: number | undefined;

  key?: never;
};

/**
 * Keeps rows by a seeded hash of `key`: reproducible across runs, VACUUMs and
 * physical layout, and stable as rows are added.
 */
export type HashSample = Common & {
  method: "hash";

  /** The column hashed. Rows sharing a value are kept or dropped together. */
  key: string;

  /** The hash seed, an integer. Defaults to `0`. */
  seed?: number | undefined;
};

/**
 * How to sample, by `method`: each method's variant carries exactly the options
 * it reads, so `hash` cannot be asked for without its `key`, nor a `key` given
 * to a method that would ignore it.
 */
export type SampleOptions = BernoulliSample | SystemSample | HashSample;

export type SampleMethod = NonNullable<SampleOptions["method"]>;

const methods = new Set(["bernoulli", "system", "hash"]);

/**
 * A query sampling about `n` of `population` rows. The count is binomial around
 * `n` rather than exact; a census needs a representative sample, not a
 * particular size.
 */
export function sample(table: Table, options: SampleOptions): Query<Row[]> {
  const { n, population } = options;
  const method = options.method ?? "bernoulli";

  if (!(Number.isSafeInteger(n) && n > 0))
    throw new CensusError.InvalidOptionError("n", n, "an integer ≥ 1");

  if (!(Number.isSafeInteger(population) && population >= 0))
    throw new CensusError.InvalidOptionError(
      "population",
      population,
      "an integer ≥ 0",
    );

  if (!methods.has(method))
    throw new CensusError.InvalidOptionError(
      "method",
      method,
      '"bernoulli", "system", or "hash"',
    );

  const seed = options.seed;

  if (seed !== undefined && !Number.isFinite(seed))
    throw new CensusError.InvalidOptionError("seed", seed, "a finite number");

  if (options.columns?.length === 0)
    throw new CensusError.InvalidOptionError(
      "columns",
      "[]",
      "at least one column, or omitted for every column",
    );

  /** At or past the whole table, every row is the sample. */
  const fraction = population === 0 ? 1 : Math.min(1, n / population);

  const selected = options.columns?.map(quote).join(", ") ?? "*";
  const from = `SELECT ${selected}\nFROM ${qualify(table)}`;
  const parameters = new Parameters();
  const where = options.where === undefined ? [] : [`(${options.where})`];

  /**
   * `SampleOptions` already rules out a hash sample without a `key`; the
   * runtime checks here and above hold the same line for untyped callers.
   */
  if (method === "hash") {
    const key = options.key;

    if (typeof key !== "string")
      throw new CensusError.InvalidOptionError(
        "key",
        key,
        "a column name for hash sampling",
      );

    if (seed !== undefined && !Number.isSafeInteger(seed))
      throw new CensusError.InvalidOptionError(
        "seed",
        seed,
        "an integer for hash sampling",
      );

    /**
     * The masked hash is uniform on `[0, 2^63)`, so keeping those below
     * `fraction · 2^63` keeps each row with probability `fraction`. Passed as a
     * decimal string: the threshold exceeds 2^53, where a JS number would round
     * it.
     */
    if (fraction < 1) {
      const threshold = BigInt(Math.floor(fraction * 2 ** 63));
      const limit = BigInt("9223372036854775807");

      where.unshift(
        `(pg_catalog.hashtextextended(${quote(key)}::text, ${parameters.add(seed ?? 0)}::int8) & ${limit.toString(10)}) < ${parameters.add((threshold > limit ? limit : threshold).toString(10))}::int8`,
      );
    }

    return {
      text: whereClause(from, where),
      values: parameters.values,
      cost: "sample",
      notes: [
        "Hash sampling reads every row. Rows sharing a key value are kept or dropped together.",
      ],
      read: (rows) => [...rows],
    };
  }

  const clause = method === "bernoulli" ? "BERNOULLI" : "SYSTEM";
  const percentage = parameters.add(fraction * 100);
  const repeatable =
    seed === undefined ? "" : ` REPEATABLE (${parameters.add(seed)}::float8)`;
  const tablesample = `${from}\nTABLESAMPLE ${clause} (${percentage}::float4)${repeatable}`;

  return {
    text: whereClause(tablesample, where),
    values: parameters.values,
    cost: "sample",
    notes:
      method === "bernoulli"
        ? [
            "BERNOULLI reads every page. REPEATABLE reproduces the sample only while the table's physical layout is unchanged.",
          ]
        : [
            "SYSTEM keeps whole pages, so rows stored together are sampled together. Where physical order tracks the values — an append-only, time-ordered table — the sample is biased; prefer bernoulli or hash there.",
          ],
    read: (rows) => [...rows],
  };
}

function whereClause(text: string, conditions: ReadonlyArray<string>): string {
  return conditions.length === 0
    ? text
    : `${text}\nWHERE ${conditions.join("\n  AND ")}`;
}
