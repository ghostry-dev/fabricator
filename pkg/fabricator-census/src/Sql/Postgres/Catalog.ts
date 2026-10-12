/**
 * Catalog queries: what the planner already knows about a table, read without
 * touching the table itself. Each resolves the table through `to_regclass`, so
 * a name is looked up exactly as the connection would resolve it, quoting and
 * `search_path` included.
 *
 * @module
 */

import { isArray } from "@ghostry/fabricator/internal";
import { CensusError } from "../../Error";
import type { BigIntFact, ColumnFacts, Facts } from "../../Facts";
import { qualify, toNumber } from "../Quote";
import type { Query, Row, Table } from "../Types";
import { columnNotes, parseNumber, parseText } from "./Coerce";

/** A column as the catalog describes it. */
export type Column = {
  name: string;

  /** The declared type, as `format_type` prints it (`character varying(40)`). */
  type: string;

  /**
   * The underlying type's name (`int8`, `text`, `_int4` for an `int4[]`),
   * looking through a domain to its base type.
   */
  base: string;

  /**
   * PostgreSQL's type category, one letter: `N` numeric, `S` string, `B`
   * boolean, `D` date/time, `A` array, `E` enum, `U` user-defined (which
   * includes `json`/`jsonb`), and so on. Decides which aggregates apply.
   */
  category: string;

  /** Declared nullable; says nothing about whether nulls occur. */
  nullable: boolean;
};

/**
 * The planner's statistics for one column, from `pg_stats` — collected by
 * `ANALYZE` from its own sample, so an estimate, not a count.
 */
export type ColumnStatistics = {
  name: string;
  nullFraction: number;

  /**
   * Distinct non-null values: a `count`, or a `fraction` of the rows when
   * `ANALYZE` judged the count to grow with the table. `null` when unknown.
   */
  distinct: { count: number } | { fraction: number } | null;

  /** The most common values in text form, with the share of rows each holds. */
  common: Array<{ value: string | null; frequency: number }>;

  /** Bounds splitting the remaining values into equal-population buckets. */
  histogram: Array<string | null> | null;

  /** Correlation of physical row order with this column's order, −1 to 1. */
  correlation: number | null;
};

/**
 * The planner's row-count estimate, from `pg_class.reltuples`. `read` returns
 * `null` when the table has never been analyzed (`reltuples` of −1, or 0 with
 * no pages on versions before 14), rather than a number that would read as an
 * empty table; `count(table)` is the exact alternative.
 */
export function estimate(table: Table): Query<number | null> {
  const name = qualify(table);

  return {
    text: [
      "SELECT c.reltuples::float8 AS reltuples, c.relpages::float8 AS relpages",
      "FROM pg_catalog.pg_class c",
      "WHERE c.oid = pg_catalog.to_regclass($1)",
    ].join("\n"),
    values: [name],
    cost: "catalog",
    notes: [
      "reltuples is the planner's estimate as of the last VACUUM or ANALYZE. A partitioned table's parent holds no rows of its own; estimate each partition.",
    ],
    read(rows) {
      const row = rows[0];
      if (row === undefined) throw new CensusError.UnknownTableError(name);
      const tuples = toNumber(row["reltuples"], "reltuples")!;
      const pages = toNumber(row["relpages"], "relpages")!;
      if (tuples < 0 || (tuples === 0 && pages === 0)) return null;
      return Math.round(tuples);
    },
  };
}

/** The exact row count, for a table `estimate` could not answer for. */
export function count(table: Table): Query<number> {
  return {
    text: `SELECT count(*)::float8 AS count FROM ${qualify(table)}`,
    values: [],
    cost: "scan",
    notes: [
      "Reads every row; run it against a replica, with a statement_timeout.",
    ],
    read(rows) {
      return toNumber(rows[0]?.["count"], "count")!;
    },
  };
}

/**
 * The table's columns in declaration order, excluding system and dropped
 * columns.
 */
export function columns(table: Table): Query<Column[]> {
  return {
    text: [
      "SELECT a.attname AS name,",
      "  pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,",
      "  COALESCE(b.typname, t.typname) AS base,",
      "  COALESCE(b.typcategory, t.typcategory) AS category,",
      "  NOT a.attnotnull AS nullable",
      "FROM pg_catalog.pg_attribute a",
      "JOIN pg_catalog.pg_type t ON t.oid = a.atttypid",
      "LEFT JOIN pg_catalog.pg_type b ON b.oid = t.typbasetype",
      "WHERE a.attrelid = pg_catalog.to_regclass($1)",
      "  AND a.attnum > 0",
      "  AND NOT a.attisdropped",
      "ORDER BY a.attnum",
    ].join("\n"),
    values: [qualify(table)],
    cost: "catalog",
    notes: [],
    read(rows) {
      return rows.map((row) => ({
        name: text(row, "name"),
        type: text(row, "type"),
        base: text(row, "base"),
        category: text(row, "category"),
        nullable: flag(row, "nullable"),
      }));
    },
  };
}

/**
 * The planner's per-column statistics. Needs no scan, but reflects `ANALYZE`'s
 * sample of roughly 300 × `default_statistics_target` rows, and `pg_stats`
 * shows only columns the role can `SELECT`. The value arrays are cast through
 * `text[]` so every driver returns them as arrays of strings.
 */
export function statistics(table: Table): Query<ColumnStatistics[]> {
  return {
    text: [
      "SELECT s.attname AS name,",
      "  s.null_frac::float8 AS null_frac,",
      "  s.n_distinct::float8 AS n_distinct,",
      "  s.most_common_vals::text::text[] AS most_common_vals,",
      "  s.most_common_freqs::float8[] AS most_common_freqs,",
      "  s.histogram_bounds::text::text[] AS histogram_bounds,",
      "  s.correlation::float8 AS correlation",
      "FROM pg_catalog.pg_stats s",
      "JOIN pg_catalog.pg_namespace n ON n.nspname = s.schemaname",
      "JOIN pg_catalog.pg_class c ON c.relname = s.tablename AND c.relnamespace = n.oid",
      "WHERE c.oid = pg_catalog.to_regclass($1)",
      "ORDER BY s.inherited, s.attname",
    ].join("\n"),
    values: [qualify(table)],
    cost: "catalog",
    notes: [
      "Statistics come from ANALYZE's own sample, so they are estimates; exact aggregates win over them.",
    ],
    /**
     * A partitioned or inherited table can have a row with and without
     * `inherited` per column; ordering puts the table's own first, and the
     * first row per column wins.
     */
    read(rows) {
      const seen = new Map<string, ColumnStatistics>();

      for (const row of rows) {
        const name = text(row, "name");
        if (seen.has(name)) continue;

        const nDistinct = toNumber(row["n_distinct"], "n_distinct");
        const values = textArray(row["most_common_vals"], "most_common_vals");
        const frequencies = textArray(
          row["most_common_freqs"],
          "most_common_freqs",
        );
        const common = (values ?? []).map((value, i) => ({
          value,
          frequency: toNumber(frequencies?.[i], "most_common_freqs") ?? 0,
        }));

        seen.set(name, {
          name,
          nullFraction: toNumber(row["null_frac"], "null_frac") ?? 0,
          distinct: distinctOf(nDistinct),
          common,
          histogram: textArray(row["histogram_bounds"], "histogram_bounds"),
          correlation: toNumber(row["correlation"], "correlation"),
        });
      }

      return [...seen.values()];
    },
  };
}

/**
 * The planner's statistics as estimated facts, scaled from fractions of
 * `ANALYZE`'s sample to `rows` — typically `estimate(table)`'s result. Values
 * are parsed by each column's type, so an `int4` column's most common values
 * are numbers and a `boolean`'s are booleans. A numeric column's extremes are
 * the outermost of its histogram bounds and common values, which `ANALYZE` drew
 * from its own sample: an estimate that can sit inside the true range, never
 * outside it. A statistics row with no matching column — one the caller left
 * out of `columns` — is skipped.
 */
export function estimatedFacts(
  statistics: ReadonlyArray<ColumnStatistics>,
  columns: ReadonlyArray<Column>,
  rows: number,
): ColumnFacts[] {
  const byName = new Map(columns.map((column) => [column.name, column]));
  const result: ColumnFacts[] = [];

  for (const stat of statistics) {
    const column = byName.get(stat.name);
    if (column === undefined) continue;

    const nulls = Math.round(stat.nullFraction * rows);
    const facts: Facts = { count: rows, nulls, source: "estimate" };

    const distinct = distinctCount(stat.distinct, rows);

    if (distinct !== null) facts.distinct = Math.min(distinct, rows - nulls);

    const common = stat.common.filter(
      (entry): entry is { value: string; frequency: number } =>
        entry.value !== null,
    );

    if (common.length > 0) {
      facts.top = common.map(({ value, frequency }) => ({
        value: parseText(value, column),
        count: Math.max(1, Math.round(frequency * rows)),
      }));
      facts.complete = distinct !== null && common.length >= distinct;
    }

    if (column.category === "N" && column.base !== "money") {
      const values = [...(stat.histogram ?? []), ...common.map((c) => c.value)]
        .filter((value): value is string => value !== null)
        .map((value) => parseNumber(value, column));

      if (values.length > 0) {
        facts.min = values.reduce((a, b) =>
          magnitude(b) < magnitude(a) ? b : a,
        );
        facts.max = values.reduce((a, b) =>
          magnitude(b) > magnitude(a) ? b : a,
        );
      }
    }

    const notes = columnNotes(column);
    if (notes.length > 0) facts.notes = notes;

    result.push({ column: column.name, facts });
  }

  return result;
}

/**
 * A numeric extreme as a `bigint` or number that orders correctly against
 * another.
 */
function magnitude(value: number | BigIntFact): number | bigint {
  return typeof value === "number" ? value : BigInt(value.value);
}

/**
 * `n_distinct` as `pg_stats` holds it: a count when positive, the negated
 * fraction of rows when negative, and zero when the planner does not know.
 */
function distinctOf(nDistinct: number | null): ColumnStatistics["distinct"] {
  if (nDistinct === null || nDistinct === 0) return null;
  if (nDistinct > 0) return { count: nDistinct };
  return { fraction: -nDistinct };
}

/** Distinct values as a count, with a fraction scaled to `rows`. */
function distinctCount(
  distinct: ColumnStatistics["distinct"],
  rows: number,
): number | null {
  if (distinct === null) return null;
  if ("count" in distinct) return Math.round(distinct.count);
  return Math.round(distinct.fraction * rows);
}

function text(row: Row, field: string): string {
  const value = row[field];

  if (typeof value !== "string")
    throw new CensusError.UnexpectedRowError(field, value);

  return value;
}

/** Drivers return a boolean, or the text `t`/`f` when they leave it unparsed. */
function flag(row: Row, field: string): boolean {
  const value = row[field];
  if (typeof value === "boolean") return value;
  if (value === "t" || value === "true") return true;
  if (value === "f" || value === "false") return false;
  throw new CensusError.UnexpectedRowError(field, value);
}

/**
 * A one-dimensional array as strings. Most drivers parse `text[]` and
 * `float8[]` into arrays already; one that does not returns PostgreSQL's
 * literal form (`{a,"b c",NULL}`), which is parsed here.
 *
 * Only the form PostgreSQL itself prints is accepted: an element is quoted
 * whenever it is empty, contains a delimiter, quote, backslash, brace or
 * whitespace, or spells `NULL`, so an unquoted `NULL` is the null and anything
 * else that does not fit — an empty unquoted element, a brace outside quotes,
 * text after a closing quote, an unterminated quote or escape — is rejected
 * rather than guessed at.
 */
export function textArray(
  value: unknown,
  field: string,
): Array<string | null> | null {
  if (value === null || value === undefined) return null;

  if (isArray(value))
    return value.map((item) => (item === null ? null : String(item)));

  if (
    typeof value !== "string"
    || !value.startsWith("{")
    || !value.endsWith("}")
  ) {
    throw new CensusError.UnexpectedRowError(field, value);
  }

  const body = value.slice(1, -1);
  if (body === "") return [];

  const malformed = () => new CensusError.UnexpectedRowError(field, value);
  const items: Array<string | null> = [];
  let i = 0;

  for (;;) {
    if (body[i] === '"') {
      let item = "";
      i++;
      for (;;) {
        const character = body[i];
        if (character === undefined) throw malformed();
        if (character === '"') break;
        if (character === "\\") {
          i++;
          const escaped = body[i];
          if (escaped === undefined) throw malformed();
          item += escaped;
        } else item += character;
        i++;
      }
      i++;
      items.push(item);
    } else {
      let end = body.indexOf(",", i);
      if (end === -1) end = body.length;
      const item = body.slice(i, end);
      if (item === "" || /["{}]/.test(item)) throw malformed();
      items.push(item === "NULL" ? null : item);
      i = end;
    }

    if (i === body.length) return items;
    if (body[i] !== ",") throw malformed();
    i++;
  }
}
