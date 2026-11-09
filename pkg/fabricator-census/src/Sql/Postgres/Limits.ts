/**
 * A column's declared limits, decoded from its type alone: what any value of
 * that type must satisfy, whatever the table holds. Needs no query beyond
 * `columns`, which already reads each type modifier.
 *
 * `CHECK` constraints, and a domain's own checks, are not read: a constraint is
 * an arbitrary expression, and only a parser for PostgreSQL's expression
 * language could tell which of them bound a range or a length.
 *
 * @module
 */

import type { ColumnLimits, Limits } from "../../Limits";
import type { Column } from "./Catalog";

/** `VARHDRSZ`: a length modifier stores the declared length plus four. */
const HEADER = 4;

const INTEGERS: Record<string, Limits> = {
  int2: { min: -32768, max: 32767 },
  int4: { min: -2147483648, max: 2147483647 },
  int8: {
    min: { type: "bigint", value: "-9223372036854775808" },
    max: { type: "bigint", value: "9223372036854775807" },
  },
};

const LENGTH_NOTE =
  "PostgreSQL counts this length in code points, while an adapter's maxLength checks UTF-16 units, where a character outside the Basic Multilingual Plane counts twice — so a value within the column's length can still fail validation.";

const NUMERIC_NOTE =
  "numeric(p, s) holds magnitudes below 10^(p − s), and that power of ten is what is admitted. No multipleOf is stated for the scale: T.number draws continuous values, and floating-point remainders reject even 0.3 as a multiple of 0.1.";

/**
 * Each column's limits, for the types that declare any: `varchar(n)` and
 * `char(n)` a length, the integer types their range, and `numeric(p, s)` the
 * power of ten its precision allows. Columns of any other type — an
 * unconstrained `numeric` or `varchar`, `text`, floats, dates, arrays — are
 * left out.
 */
export function limits(columns: ReadonlyArray<Column>): ColumnLimits[] {
  const result: ColumnLimits[] = [];

  for (const column of columns) {
    const decoded = decode(column);
    if (decoded !== null) result.push({ column: column.name, limits: decoded });
  }

  return result;
}

function decode(column: Column): Limits | null {
  const integer = INTEGERS[column.base];
  if (integer !== undefined) return structuredClone(integer);

  if (column.typmod === null) return null;

  if (column.base === "varchar" || column.base === "bpchar")
    return { length: { max: column.typmod - HEADER }, notes: [LENGTH_NOTE] };

  if (column.base === "numeric") return numeric(column.typmod);

  return null;
}

/**
 * `numeric(p, s)`'s modifier packs `p` into the upper sixteen bits and `s` into
 * the lower eleven, two's complement since PostgreSQL 15 allows a negative
 * scale. A bound past what a JS number holds — precision far above scale —
 * declares nothing a number could exceed, so it is left out.
 */
function numeric(typmod: number): Limits | null {
  const packed = typmod - HEADER;
  const precision = (packed >> 16) & 0xffff;
  const scale = ((packed & 0x7ff) ^ 0x400) - 0x400;

  /** Correctly rounded, so a value below the power reads as at most it. */
  const bound = Number(`1e${precision - scale}`);
  if (!Number.isFinite(bound)) return null;

  return { min: -bound, max: bound, notes: [NUMERIC_NOTE] };
}
