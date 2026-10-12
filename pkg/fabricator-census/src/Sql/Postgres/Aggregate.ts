/**
 * Pushdown aggregates: exact whole-table facts per column, computed by the
 * database in one scan each, so a census of a sample can carry the table's true
 * null counts, extremes and most frequent values.
 *
 * @module
 */

import { isArray } from "@ghostry/fabricator/internal";
import { CensusError } from "../../Error";
import type { ColumnFacts, Facts, FactValue } from "../../Facts";
import { Parameters, qualify, quote, toNumber } from "../Quote";
import type { Query, Row, Table } from "../Types";
import type { Column } from "./Catalog";
import { columnNotes, parseNumber, parseText } from "./Coerce";

export type AggregateOptions = {
  /**
   * Most frequent values to count per enum-like column (text, boolean, enum and
   * integer types); `0` skips them. One more is fetched, to tell whether these
   * are every distinct value. Defaults to `256`, the census's own `distinct`
   * default.
   */
  topK?: number | undefined;

  /**
   * `exact` counts distinct values with `count(DISTINCT …)`, a sort or hash of
   * the whole column. `estimate`, the default, leaves the count to
   * `statistics`.
   */
  distinct?: "estimate" | "exact" | undefined;
};

const INTEGERS = new Set(["int2", "int4", "int8"]);

/**
 * One scan query per column, with the aggregates its type supports. Columns are
 * separate queries so each can be run, timed out or skipped on its own.
 * `json`/`jsonb` and other user-defined types get only their null counts; a
 * sample describes their inner structure.
 */
export function aggregates(
  table: Table,
  columns: ReadonlyArray<Column>,
  options?: AggregateOptions,
): Array<Query<ColumnFacts>> {
  const topK = options?.topK ?? 256;
  if (!(Number.isSafeInteger(topK) && topK >= 0))
    throw new CensusError.InvalidOptionError("topK", topK, "an integer ≥ 0");
  const distinct = options?.distinct ?? "estimate";
  if (distinct !== "estimate" && distinct !== "exact")
    throw new CensusError.InvalidOptionError(
      "distinct",
      distinct,
      '"estimate" or "exact"',
    );
  return columns.map((column) => aggregate(table, column, topK, distinct));
}

function aggregate(
  table: Table,
  column: Column,
  topK: number,
  distinct: "estimate" | "exact",
): Query<ColumnFacts> {
  const name = qualify(table);
  const c = quote(column.name);
  const parameters = new Parameters();
  const select = [
    "count(*)::float8 AS count",
    `count(${c})::float8 AS present`,
  ];
  const notes = [
    "Reads every row; run it against a replica, with a statement_timeout.",
  ];

  if (distinct === "exact")
    select.push(`count(DISTINCT ${c})::float8 AS n_distinct`);

  const { category, base } = column;
  /**
   * `int8` and `numeric` extremes travel as text: through `float8` an `int8`
   * past 2^53 would round inside the database, and a `numeric` past `float8`'s
   * range would fail the cast. Moments are approximate anyway.
   */
  const exactExtremes = base === "int8" || base === "numeric";
  if (category === "N" && base !== "money")
    select.push(
      `min(${c})::${exactExtremes ? "text" : "float8"} AS min`,
      `max(${c})::${exactExtremes ? "text" : "float8"} AS max`,
      `avg(${c})::float8 AS mean`,
      `stddev_samp(${c})::float8 AS stddev`,
    );
  if (category === "D")
    select.push(
      `(extract(epoch FROM min(${c})) * 1000)::float8 AS min`,
      `(extract(epoch FROM max(${c})) * 1000)::float8 AS max`,
    );
  if (category === "S") {
    select.push(
      `min(char_length(${c}))::float8 AS length_min`,
      `max(char_length(${c}))::float8 AS length_max`,
    );
    notes.push(
      "char_length counts code points, where a census counts UTF-16 units; the two differ wherever a character lies outside the Basic Multilingual Plane.",
    );
  }
  if (category === "A")
    select.push(
      `min(cardinality(${c}))::float8 AS length_min`,
      `max(cardinality(${c}))::float8 AS length_max`,
    );

  const enumLike =
    category === "S"
    || category === "B"
    || category === "E"
    || INTEGERS.has(base);
  const withTop = enumLike && topK > 0;
  if (withTop)
    select.push(
      [
        "(SELECT pg_catalog.json_agg(pg_catalog.json_build_array(top.value, top.n))",
        `  FROM (SELECT ${c}::text AS value, count(*)::float8 AS n`,
        `    FROM ${name} WHERE ${c} IS NOT NULL`,
        `    GROUP BY ${c} ORDER BY count(*) DESC, ${c}`,
        `    LIMIT ${parameters.add(topK + 1)}) AS top) AS top`,
      ].join("\n"),
    );

  return {
    text: `SELECT ${select.join(",\n  ")}\nFROM ${name}`,
    values: parameters.values,
    cost: "scan",
    notes,
    read(rows) {
      const row = rows[0];
      if (row === undefined)
        throw new CensusError.UnexpectedRowError("count", undefined);
      const count = toNumber(row["count"], "count")!;
      const present = toNumber(row["present"], "present")!;
      const facts: Facts = { count, nulls: count - present, source: "exact" };

      const optional = (field: string) => toNumber(row[field], field);

      const extreme = (field: string) => {
        const value = row[field];

        if (exactExtremes && typeof value === "string")
          return parseNumber(value, column);

        return optional(field);
      };

      const exactDistinct = optional("n_distinct");
      if (exactDistinct !== null) facts.distinct = exactDistinct;

      const min = extreme("min");
      const max = extreme("max");
      if (min !== null && max !== null) {
        facts.min = min;
        facts.max = max;
      }

      const mean = optional("mean");
      if (mean !== null) facts.mean = mean;

      const stddev = optional("stddev");
      if (stddev !== null) facts.stddev = stddev;

      const lengthMin = optional("length_min");
      const lengthMax = optional("length_max");
      if (lengthMin !== null && lengthMax !== null) {
        facts.length = { min: lengthMin, max: lengthMax };
      }

      if (withTop) {
        const entries = topEntries(row, column);
        facts.top = entries.slice(0, topK);
        facts.complete = entries.length <= topK;
      }

      const notes = columnNotes(column);
      if (notes.length > 0) facts.notes = notes;

      return { column: column.name, facts };
    },
  };
}

/**
 * `json_agg` of `[value, count]` pairs, each value cast to text in the query
 * and parsed back by the column's type. Drivers parse `json` already; one that
 * leaves it as text is parsed here. No non-null rows aggregate to `null`.
 */
function topEntries(
  row: Row,
  column: Column,
): Array<{ value: FactValue; count: number }> {
  let value = row["top"];
  if (value === null || value === undefined) return [];

  if (typeof value === "string") {
    value = JSON.parse(value) as unknown;
  }

  if (!isArray(value)) throw new CensusError.UnexpectedRowError("top", value);

  return value.map((entry) => {
    if (!isArray(entry) || typeof entry[0] !== "string")
      throw new CensusError.UnexpectedRowError("top", entry);

    return {
      value: parseText(entry[0], column),
      count: toNumber(entry[1], "top")!,
    };
  });
}
