import { effectiveDiscrete, effectiveDiscreteBigint } from "../Bound";
import { isDrawable } from "../Distribution";
import { toEpochRange } from "../Primitive/date/Defaults";
import { toStringDomain } from "../Primitive/string/Capacity";
import { toSchema } from "../Schema/Core";
import { Fixed, Kind, Meta, type Buildable } from "../Types";
import { toNumberCapacity, toRangeCapacity } from "./Distinct";
import { toDistinctValues } from "./Strategy";

/**
 * How many times one built Fabricator of `schema` can `fabricate()` before a
 * `T.unique.*` leaf runs out, or `undefined` when no leaf has a known limit.
 * The answer for a fresh Fabricator: it does not count what an existing one has
 * already drawn.
 */
export type Capacity = (schema: Buildable) => bigint | undefined;

/**
 * Walk `schema` — the Schema, not a build, so nothing is constructed, no
 * ordinal is taken, and an object's hidden fields are seen — and take the
 * tightest limit any unique leaf sets. A leaf allows `capacity / draws`
 * fabrications, `draws` being the most times one fabrication can reach it: one,
 * multiplied by `length.max`/`size.max` for each array or record above it.
 *
 * Conservative where a leaf may not draw at all: one behind a presence wrapper
 * or a `choice` option is counted as drawing every time. Not counted, since
 * they never limit one Fabricator's fabrications:
 *
 * - a unique collection's members, distinct only within each value and checked
 *   against the length at construction;
 * - anything under `T.recursive`, whose expansions each build afresh;
 * - a `[Fixed]` field and an `object.compute` source, which never draw;
 * - any node with `.as(...)`, whose producer replaces everything beneath it;
 * - a leaf of unknown size, such as a continuous `T.unique.number` range.
 *
 * `clock` resolves a `date` leaf's `past`/`future` end.
 */
export function toCapacity(
  schema: Buildable,
  clock: number,
): bigint | undefined {
  const limits: bigint[] = [];

  walk(toSchema(schema), BigInt(1), clock, limits);

  return limits.reduce<bigint | undefined>(
    (tightest, limit) =>
      tightest === undefined || limit < tightest ? limit : tightest,
    undefined,
  );
}

/** @mutates limits */
function walk(node: any, draws: bigint, clock: number, limits: bigint[]): void {
  const meta = node?.[Meta];
  if (!meta || meta.produce || draws === BigInt(0)) return;

  if (meta.unique === true && node[Kind] !== "record") {
    const capacity = toLeafCapacity(node[Kind], meta, clock);
    if (capacity !== undefined) limits.push(capacity / draws);
    return;
  }

  const visit = (child: unknown, times = draws) =>
    walk(child, times, clock, limits);

  switch (node[Kind]) {
    case "object": {
      const fields = { ...meta.definition, ...meta.hidden };
      for (const field of Object.values<any>(fields)) {
        if (Fixed in field) continue;
        visit(field);
      }
      return;
    }
    case "tuple":
      meta.items.forEach((item: unknown) => visit(item));
      return;
    case "derive":
      meta.from.forEach((item: unknown) => visit(item));
      return;
    case "choice":
      for (const [weight, option] of meta.items) {
        if (isDrawable(weight)) visit(option);
      }
      return;
    case "nullable":
    case "nullish":
    case "undefinable":
    case "object.omittable":
    case "object.optional":
      visit(meta.definition);
      return;
    case "array": {
      const { max } = effectiveDiscrete(
        meta.whereby.length.min,
        meta.whereby.length.max,
      );
      visit(meta.definition, draws * BigInt(max));
      return;
    }
    case "record": {
      const max = meta.unique
        ? effectiveDiscrete(meta.whereby.size.min, meta.whereby.size.max).max
        : meta.whereby.size.max;
      visit(meta.key, draws * BigInt(max));
      visit(meta.value, draws * BigInt(max));
      return;
    }
    default:
      return;
  }
}

/**
 * How many distinct values a unique leaf of `kind` can produce — the same count
 * its strategy exhausts at (`Unique/Distinct.ts`, `Unique/Strategy.ts`,
 * `string/Capacity.ts`).
 */
function toLeafCapacity(
  kind: string,
  meta: any,
  clock: number,
): bigint | undefined {
  switch (kind) {
    case "enum":
      return BigInt(toDistinctValues(meta.items).values.length);
    case "number":
      return toNumberCapacity(meta);
    case "bigint": {
      const range = effectiveDiscreteBigint(meta.whereby.min, meta.whereby.max);
      return range.max - range.min + BigInt(1);
    }
    case "date":
      return toRangeCapacity(toEpochRange(meta, clock));
    case "string":
      return toStringDomain(meta.whereby).capacity;
    default:
      return undefined;
  }
}
