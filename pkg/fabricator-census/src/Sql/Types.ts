/**
 * The shapes every SQL builder shares, regardless of dialect.
 *
 * @module
 */

/**
 * What a query reads. `catalog` touches only system catalogs; `sample` reads
 * some or all of a table's pages to return a sample; `scan` reads every row to
 * aggregate over it.
 */
export type Cost = "catalog" | "sample" | "scan";

/** One result row as a driver returns it: column name to value. */
export type Row = Record<string, unknown>;

/**
 * A query to run with any driver, and the parser for its rows. Nothing here
 * opens a connection: `q.read((await client.query(q.text, q.values)).rows)` is
 * the whole contract.
 */
export type Query<$Result> = {
  /** SQL with `$1`, `$2`, … placeholders. */
  text: string;

  /** The placeholders' values, in order. Every caller-supplied number is here. */
  values: unknown[];
  cost: Cost;

  /** What the caller should know before running it, or about its result. */
  notes: string[];
  read(rows: ReadonlyArray<Row>): $Result;
};

/**
 * A table, by name or with its schema. A bare string is one unqualified name,
 * never split on dots: `"a.b"` is the table named `a.b`.
 */
export type Table = string | { schema?: string | undefined; table: string };
