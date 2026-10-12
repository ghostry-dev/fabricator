/**
 * Reading PostgreSQL values by column type. Drivers disagree on how they return
 * the types a census cares about — `int8` and `numeric` as strings by default
 * in node-postgres, `int8` as a number or a `bigint` depending on its size in
 * PGlite, an unparsed `boolean` as `t`/`f` — and text from a catalog or a
 * `::text` cast is untyped. Everything here turns those back into the values
 * the column holds.
 *
 * @module
 */

import type { BigIntFact, FactValue } from "../../Facts";
import type { Row } from "../Types";
import type { Column } from "./Catalog";

const INTEGERS = new Set(["int2", "int4", "int8"]);
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const MIN = -MAX;

/** An integer printed as text. */
const WHOLE = /^-?\d+$/;

type Coercer = (value: unknown) => unknown;

/**
 * A column value printed as text — a `::text` cast, a catalog's most common
 * value — parsed back into the value its type holds. Integers past 2^53 stay
 * exact as a `bigint` tag; anything this does not recognize stays text.
 */
export function parseText(text: string, column: Column): FactValue {
  if (column.category === "B") {
    if (text === "t" || text === "true") return true;
    if (text === "f" || text === "false") return false;
  }

  if (column.category === "N" && column.base !== "money")
    return parseNumber(text, column);

  return text;
}

/**
 * A numeric column's extreme, printed as text so `int8` and `numeric` lose
 * nothing in transit.
 */
export function parseNumber(text: string, column: Column): number | BigIntFact {
  if (!INTEGERS.has(column.base) || !WHOLE.test(text)) return Number(text);

  const value = BigInt(text);
  if (isWide(value)) return { type: "bigint", value: value.toString() };

  return Number(value);
}

/** What a column's type means for the values a census sees. */
export function columnNotes(column: Column): string[] {
  switch (column.base) {
    case "numeric":
      return [
        "numeric values are read as JS numbers, which hold about 15–17 significant digits; wider values are rounded.",
      ];
    case "timestamp":
      return [
        "timestamp without time zone has no offset, so drivers read it in the local time zone of the process; its instants shift with where the census runs.",
      ];
    case "date":
      return [
        "Drivers differ on whether a date reads as local or UTC midnight, so its instants can shift by the local offset.",
      ];
    default:
      return [];
  }
}

/**
 * Rows with each column's values as its type holds them: `int8` as a number
 * when every value in the column is safe, otherwise as a `bigint` throughout —
 * one representation per column, so a census tallies it as one type — and other
 * numeric types and booleans parsed from text where a driver left them as text.
 * Values of every other type are left as the driver returned them. Rows are
 * copied, never mutated.
 */
export function coerce(
  rows: ReadonlyArray<Row>,
  columns: ReadonlyArray<Column>,
): Row[] {
  const coercers = new Map<string, Coercer>();

  for (const column of columns) {
    const coercer = coercerFor(rows, column);
    if (coercer !== null) coercers.set(column.name, coercer);
  }

  if (coercers.size === 0) return rows.map((row) => ({ ...row }));

  return rows.map((row) => {
    const copy: Row = { ...row };

    for (const [name, coercer] of coercers) {
      if (!Object.prototype.hasOwnProperty.call(copy, name)) continue;
      const value = copy[name];
      if (value === null || value === undefined) continue;

      /**
       * `defineProperty`, not assignment: a column is data, and one named
       * `__proto__` would otherwise replace the copy's prototype.
       */
      Object.defineProperty(copy, name, {
        value: coercer(value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return copy;
  });
}

/**
 * How to read one column's values, or `null` for a type left as the driver
 * returned it. An `int8` column is decided by every row at once: a single value
 * past 2^53 makes the whole column a `bigint`.
 */
function coercerFor(rows: ReadonlyArray<Row>, column: Column): Coercer | null {
  if (column.category === "B") return readBoolean;
  if (column.category !== "N" || column.base === "money") return null;
  if (column.base !== "int8") return readNumeric;

  const wide = rows.some((row) => needsBigInt(row[column.name]));
  if (wide) return readBigInt;

  return readSafeInteger;
}

/** Whether an integer lies outside what a JS number holds exactly. */
function isWide(value: bigint): boolean {
  return value > MAX || value < MIN;
}

/** Whether an `int8` value, in whichever form a driver returned it, is wide. */
function needsBigInt(value: unknown): boolean {
  if (typeof value === "bigint") return isWide(value);

  if (typeof value === "string" && WHOLE.test(value))
    return isWide(BigInt(value));

  return false;
}

/** A boolean a driver left as text, as a boolean; anything else as is. */
function readBoolean(value: unknown): unknown {
  if (value === "t" || value === "true") return true;
  if (value === "f" || value === "false") return false;

  return value;
}

/** An `int8` value as a `bigint`; anything that is not an integer as is. */
function readBigInt(value: unknown): unknown {
  if (typeof value === "bigint") return value;

  if (typeof value === "number" && Number.isInteger(value))
    return BigInt(value);

  if (typeof value === "string" && WHOLE.test(value)) return BigInt(value);

  return value;
}

/** An `int8` value as a number, for a column whose every value is safe. */
function readSafeInteger(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);

  return readNumeric(value);
}

/** A numeric value a driver left as text, as a number; anything else as is. */
function readNumeric(value: unknown): unknown {
  if (typeof value !== "string" || value.trim() === "") return value;

  const number = Number(value);
  if (Number.isNaN(number) && value !== "NaN") return value;

  return number;
}
