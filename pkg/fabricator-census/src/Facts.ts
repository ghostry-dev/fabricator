/**
 * Whole-table facts about a column, from pushdown aggregates (`exact`) or the
 * planner's statistics (`estimate`), to be merged over what a sample observed.
 * Plain data with no dialect in it, and safe to `JSON.stringify`: facts can
 * come from any database, be cached, or be written by hand.
 *
 * @module
 */

import { isArray } from "@ghostry/fabricator/internal";
import { CensusError } from "./Error";

/** An integer too large for a JS number, as its decimal string. */
export type BigIntFact = { type: "bigint"; value: string };

/** A value as facts record it, typed by the column it came from. */
export type FactValue = string | number | boolean | BigIntFact;

export type Facts = {
  /** Rows in the table. */
  count: number;

  /** Rows where the column is null. */
  nulls: number;

  /** Distinct non-null values. */
  distinct?: number | undefined;

  /**
   * Extremes of the non-null values: numbers as numbers — a `bigint` tag past
   * 2^53 — and dates and timestamps as epoch milliseconds.
   */
  min?: number | BigIntFact | undefined;
  max?: number | BigIntFact | undefined;
  mean?: number | undefined;
  stddev?: number | undefined;

  /**
   * Extremes of a text column's length in code points, or an array column's
   * element count. Code points, not UTF-16 units: a census's string lengths
   * differ wherever an astral character occurs.
   */
  length?: { min: number; max: number } | undefined;

  /** The most frequent non-null values, most frequent first. */
  top?: Array<{ value: FactValue; count: number }> | undefined;

  /** Whether `top` is every distinct value, rather than only the most frequent. */
  complete?: boolean | undefined;

  /** What a reader should know about the column's values. */
  notes?: string[] | undefined;

  source: "exact" | "estimate";
};

/** Facts for one column, by name. */
export type ColumnFacts = { column: string; facts: Facts };

/**
 * Check facts handed to a census, so a malformed entry fails where it was
 * passed rather than as a strange suggestion later.
 */
export function validateFacts(
  entries: ReadonlyArray<ColumnFacts>,
): ColumnFacts[] {
  if (!isArray(entries))
    throw new CensusError.InvalidOptionError(
      "facts",
      entries,
      "an array of { column, facts }",
    );

  return entries.map((entry, i) => {
    const where = `facts[${i}]`;

    const fail = (field: string, expected: string, value: unknown): never => {
      throw new CensusError.InvalidOptionError(
        `${where}.${field}`,
        value,
        expected,
      );
    };

    if (typeof entry?.column !== "string")
      fail("column", "a column name", entry?.column);

    const facts = entry.facts;
    if (facts === null || typeof facts !== "object")
      fail("facts", "an object", facts);

    const count = (field: string, value: unknown) => {
      if (
        !(
          typeof value === "number"
          && Number.isSafeInteger(value)
          && value >= 0
        )
      )
        fail(field, "an integer ≥ 0", value);
    };

    count("facts.count", facts.count);
    count("facts.nulls", facts.nulls);

    if (facts.nulls > facts.count)
      fail("facts.nulls", "at most facts.count", facts.nulls);

    if (facts.distinct !== undefined) count("facts.distinct", facts.distinct);

    if (facts.source !== "exact" && facts.source !== "estimate")
      fail("facts.source", '"exact" or "estimate"', facts.source);

    const top = (facts.top ?? []).entries();

    for (const [j, item] of top) count(`facts.top[${j}].count`, item.count);

    return { column: entry.column, facts: structuredClone(facts) };
  });
}

/** Which source each resolved field came from. */
export type Sources = Partial<Record<keyof Facts, "exact" | "estimate">>;

/**
 * One column's facts, field by field: an exact field over an estimated one, so
 * a scan's null count wins over the planner's while the planner's distinct
 * count still fills in where no scan counted it. `top` and `complete` travel
 * together, from whichever source had `top`; notes from every source are kept.
 */
export function resolveFacts(
  entries: ReadonlyArray<Facts>,
): { facts: Facts; sources: Sources } | null {
  const exact = entries.filter((f) => f.source === "exact");
  const estimate = entries.filter((f) => f.source === "estimate");
  const ordered = [...exact, ...estimate];
  const first = ordered[0];
  if (first === undefined) return null;

  const facts: Facts = {
    count: first.count,
    nulls: first.nulls,
    source: first.source,
  };
  const sources: Sources = { count: first.source, nulls: first.source };
  const fields = [
    "distinct",
    "min",
    "max",
    "mean",
    "stddev",
    "length",
  ] as const;

  for (const field of fields) {
    const from = ordered.find((f) => f[field] !== undefined);
    if (from === undefined) continue;

    (facts as Record<string, unknown>)[field] = from[field];
    sources[field] = from.source;
  }

  const top = ordered.find((f) => f.top !== undefined);
  if (top !== undefined) {
    facts.top = top.top;
    facts.complete = top.complete ?? false;
    sources.top = top.source;
  }

  const notes = [...new Set(ordered.flatMap((f) => f.notes ?? []))];
  if (notes.length > 0) facts.notes = notes;

  return { facts, sources };
}

/** A fact extreme as a number; a `bigint` tag converts, losing precision. */
export function factNumber(value: number | BigIntFact): number {
  return typeof value === "number" ? value : Number(value.value);
}

/** A fact extreme as a `bigint`'s decimal string. */
export function factBigInt(value: number | BigIntFact): string {
  return typeof value === "number"
    ? String(BigInt(Math.trunc(value)))
    : value.value;
}
