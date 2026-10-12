/**
 * `@ghostry/fabricator-census/postgres` — builders for the PostgreSQL queries a
 * census is fed from: catalog estimates and statistics, sampling, and
 * whole-table pushdown aggregates. Every builder returns query text, its
 * parameters, and a parser for the rows; none of them opens a connection. The
 * caller runs each query with their own driver.
 *
 * @module
 */

export {
  columns,
  count,
  estimate,
  estimatedFacts,
  statistics,
  type Column,
  type ColumnStatistics,
} from "./Sql/Postgres/Catalog";

export {
  sample,
  type BernoulliSample,
  type HashSample,
  type SampleMethod,
  type SampleOptions,
  type SystemSample,
} from "./Sql/Postgres/Sample";

export { aggregates, type AggregateOptions } from "./Sql/Postgres/Aggregate";

/**
 * Rows and catalog text as the values their column types hold, whatever the
 * driver returned.
 */
export { coerce, parseText } from "./Sql/Postgres/Coerce";

export type { BigIntFact, ColumnFacts, Facts, FactValue } from "./Facts";

export {
  collect,
  type Collected,
  type CollectOptions,
  type Run,
} from "./Sql/Postgres/Collect";

export type { Cost, Query, Row, Table } from "./Sql/Types";
