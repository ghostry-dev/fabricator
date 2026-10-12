/**
 * The whole PostgreSQL path in one call: size, sample and describe a table
 * through a caller-supplied `run`, and return rows and facts ready for a
 * census. Sugar over the builders, which stay the primary API — `collect` only
 * runs them in order and threads each result into the next.
 *
 * @module
 */

import { CensusError } from "../../Error";
import type { ColumnFacts } from "../../Facts";
import {
  sampleSize,
  type SampleSize,
  type SampleSizeOptions,
} from "../../SampleSize";
import type { Cost, Query, Row, Table } from "../Types";
import { aggregates, type AggregateOptions } from "./Aggregate";
import {
  columns as columnsOf,
  count,
  estimate,
  estimatedFacts,
  statistics,
  type Column,
} from "./Catalog";
import { coerce } from "./Coerce";
import {
  sample,
  type BernoulliSample,
  type HashSample,
  type SystemSample,
} from "./Sample";

/**
 * Runs one query with the caller's driver and resolves to its result rows —
 * `(text, values) => client.query(text, values).then((r) => r.rows)`.
 */
export type Run = (
  text: string,
  values: unknown[],
) => Promise<ReadonlyArray<Row>>;

type SizeOf<$Options> = Omit<$Options, "n" | "population">;

export type CollectOptions = {
  table: Table;

  /**
   * `scan` (the default) runs the exact per-column aggregates after sampling;
   * `catalog` skips them, reading only the catalog and the sample. A table
   * never analyzed has no row estimate, and under `catalog` that is an error
   * rather than a counting scan.
   */
  budget?: "catalog" | "scan" | undefined;

  /** How large a sample to draw; `population` is the table's own estimate. */
  size?: Omit<SampleSizeOptions, "population"> | undefined;

  /** How to draw it; `n` and `population` come from `size` and the estimate. */
  sample?:
    | SizeOf<BernoulliSample>
    | SizeOf<SystemSample>
    | SizeOf<HashSample>
    | undefined;

  aggregates?: AggregateOptions | undefined;
};

export type Collected = {
  /** The sample, coerced by column type. */
  rows: Row[];

  /** Estimated facts from statistics, then exact facts from the aggregates. */
  facts: ColumnFacts[];

  /** The columns described, limited to `sample.columns` when it was given. */
  columns: Column[];

  /** Rows in the table: the planner's estimate, or a count when there was none. */
  population: number;
  size: SampleSize;

  /** Every query run, in order, with its cost and notes. */
  queries: Array<{ text: string; cost: Cost; notes: string[] }>;
};

/**
 * Steps, in order: the row estimate (a count if the table was never analyzed),
 * the columns, the planner's statistics as estimated facts, a sample sized by
 * `sampleSize` against the estimate, coercion of its rows, and — unless
 * `budget` is `catalog` — one exact aggregate per column.
 *
 * ```ts
 * const { rows, facts } = await collect(run, { table: "users" });
 * const users = census.from(rows, { facts });
 * ```
 */
export async function collect(
  run: Run,
  options: CollectOptions,
): Promise<Collected> {
  const { table } = options;
  const budget = options.budget ?? "scan";

  if (budget !== "scan" && budget !== "catalog")
    throw new CensusError.InvalidOptionError(
      "budget",
      budget,
      '"catalog" or "scan"',
    );

  const queries: Collected["queries"] = [];
  const execute = async <$Result>(query: Query<$Result>): Promise<$Result> => {
    queries.push({ text: query.text, cost: query.cost, notes: query.notes });
    return query.read(await run(query.text, query.values));
  };

  let population = await execute(estimate(table));
  if (population === null) {
    if (budget === "catalog")
      throw new CensusError.UnanalyzedTableError(
        typeof table === "string" ? table : table.table,
      );
    population = await execute(count(table));
  }

  const selected = options.sample?.columns;
  const described = await execute(columnsOf(table));

  const columns =
    selected === undefined
      ? described
      : selected.map((name) => {
          const column = described.find((c) => c.name === name);

          if (column === undefined)
            throw new CensusError.InvalidOptionError(
              "sample.columns",
              name,
              "a column of the table",
            );

          return column;
        });

  const facts = estimatedFacts(
    await execute(statistics(table)),
    columns,
    population,
  );

  const size = sampleSize({ ...options.size, population });

  const rows =
    size.n === 0
      ? []
      : coerce(
          await execute(
            sample(table, { ...options.sample, n: size.n, population }),
          ),
          columns,
        );

  if (budget === "scan")
    for (const query of aggregates(table, columns, options.aggregates))
      facts.push(await execute(query));

  return { rows, facts, columns, population, size, queries };
}
