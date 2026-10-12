/**
 * Identifier quoting and placeholder numbering. Identifiers are the one part of
 * a query's text that comes from the caller, so they are always quoted — never
 * interpolated bare — and everything else a caller supplies is a parameter.
 *
 * @module
 */

import { CensusError } from "../Error";
import type { Table } from "./Types";

/**
 * An identifier in double quotes, each `"` inside doubled: the SQL-standard
 * form PostgreSQL uses, which makes any name — mixed case, spaces, quotes,
 * reserved words — a single identifier. A NUL cannot appear in one at all.
 */
export function quote(identifier: string): string {
  if (identifier.length === 0 || identifier.includes("\0"))
    throw new CensusError.InvalidIdentifierError(identifier);

  return `"${identifier.replace(/"/g, '""')}"`;
}

/** A table as a quoted, optionally schema-qualified name. */
export function qualify(table: Table): string {
  if (typeof table === "string") return quote(table);
  if (table.schema === undefined) return quote(table.table);
  return `${quote(table.schema)}.${quote(table.table)}`;
}

/**
 * Collects parameter values and hands back each one's placeholder, so a builder
 * writes `${p.add(n)}` where the value belongs and cannot misnumber them.
 */
export class Parameters {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/**
 * A `float8` result field as a number; a `null` stays `null`. Every numeric
 * field these queries read is cast to `float8` in the SQL, which drivers return
 * as a number, or as its text when they leave it unparsed. A `bigint` is
 * rejected rather than converted: no driver returns one for `float8`, so it
 * means rows from some other query, and `Number(bigint)` would round it past
 * 2^53 without a word.
 */
export function toNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (!Number.isNaN(number) || value === "NaN") return number;
  }
  throw new CensusError.UnexpectedRowError(field, value);
}
