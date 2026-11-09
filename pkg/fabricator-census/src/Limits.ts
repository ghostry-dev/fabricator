/**
 * Declared limits on a column: what it accepts, where `Facts` describe what it
 * holds. A suggestion's `whereby` comes from facts and the sample, and its
 * `admits` from limits alone, so an adapter states the source's own bounds
 * rather than the extremes a census happened to observe. Plain data with no
 * dialect in it, and safe to `JSON.stringify`: limits can come from any
 * database's catalog, or be written by hand.
 *
 * @module
 */

import { isArray } from "@ghostry/fabricator/internal";
import { CensusError } from "./Error";
import type { BigIntFact } from "./Facts";

export type Limits = {
  /**
   * The inclusive extremes the column accepts: numbers as numbers — a `bigint`
   * tag past 2^53 — and dates as epoch milliseconds, as `Facts` records them.
   * An end left out declares no limit.
   */
  min?: number | BigIntFact | undefined;
  max?: number | BigIntFact | undefined;

  /**
   * The longest value the column accepts: code points for text, elements for an
   * array.
   */
  length?: { max: number } | undefined;

  /** What a reader should know about how these limits are stated. */
  notes?: string[] | undefined;
};

/** Limits for one column, by name. */
export type ColumnLimits = { column: string; limits: Limits };

const WHOLE = /^-?\d+$/;

/**
 * Check limits handed to a census, so a malformed entry fails where it was
 * passed rather than as a strange suggestion later. A column may appear once:
 * unlike facts, limits have no exact-over-estimate order to merge by.
 */
export function validateLimits(
  entries: ReadonlyArray<ColumnLimits>,
): ColumnLimits[] {
  if (!isArray(entries))
    throw new CensusError.InvalidOptionError(
      "limits",
      entries,
      "an array of { column, limits }",
    );

  const seen = new Set<string>();

  return entries.map((entry, i) => {
    const where = `limits[${i}]`;

    const fail = (field: string, expected: string, value: unknown): never => {
      throw new CensusError.InvalidOptionError(
        `${where}.${field}`,
        value,
        expected,
      );
    };

    if (typeof entry?.column !== "string")
      fail("column", "a column name", entry?.column);

    if (seen.has(entry.column))
      fail("column", "a column not already given limits", entry.column);

    seen.add(entry.column);

    const limits = entry.limits;
    if (limits === null || typeof limits !== "object")
      fail("limits", "an object", limits);

    const end = (field: "min" | "max"): bigint | number | undefined => {
      const value = limits[field];
      if (value === undefined) return undefined;
      if (typeof value === "number" && Number.isFinite(value)) return value;

      if (
        typeof value === "object"
        && value !== null
        && value.type === "bigint"
        && typeof value.value === "string"
        && WHOLE.test(value.value)
      )
        return BigInt(value.value);

      return fail(
        `limits.${field}`,
        'a finite number or { type: "bigint", value }',
        value,
      );
    };

    const min = end("min");
    const max = end("max");

    if (min !== undefined && max !== undefined && min > max)
      fail("limits.min", "at most limits.max", limits.min);

    if (limits.length !== undefined) {
      const longest = limits.length?.max;
      if (
        !(
          typeof longest === "number"
          && Number.isSafeInteger(longest)
          && longest >= 0
        )
      )
        fail("limits.length.max", "an integer ≥ 0", longest);
    }

    if (
      limits.notes !== undefined
      && !(
        isArray(limits.notes)
        && limits.notes.every((note) => typeof note === "string")
      )
    )
      fail("limits.notes", "an array of strings", limits.notes);

    return { column: entry.column, limits: structuredClone(limits) };
  });
}
