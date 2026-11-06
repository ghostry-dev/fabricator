import { effectiveDiscrete } from "../../Bound";
import { isDrawable } from "../../Distribution";
import { bmpScalars, toRanges, toSources } from "./Sources";
import type { CodepointRange, Whereby } from "./Types";

/**
 * The strings a `string` `whereby` can produce: how many, and a membership test
 * for a value claimed rather than drawn (`Unique/Strategy.ts`'s `tracked`,
 * whose `admits` keeps an out-of-domain override from using up capacity).
 */
export type StringDomain = {
  readonly capacity: bigint;
  admits: (value: unknown) => boolean;
};

/**
 * Count exactly what `Fabricator.ts` can produce, so a unique string exhausts
 * by counting and a unique collection of strings is checked at construction.
 *
 * The characters are the union of every drawable source's code points — a
 * character two sources share counts once. Length is in UTF-16 code units: a
 * BMP character takes one, an astral character two. So with `a` one-unit and
 * `b` two-unit characters, the strings of exactly `L` units number `f(L) =
 * a·f(L − 1) + b·f(L − 2)`, `f(0) = 1`.
 *
 * The fabricator also has a filler: when one unit of budget is left and an
 * astral character is drawn, it inserts one BMP scalar from outside the
 * composition at any character boundary and stops. So when `b > 0`, a string of
 * `L` units may also be any `L − 1`-unit string with one such character
 * inserted. Its positions are the base string's character count plus one, so
 * the count carries `c(L)`, the total characters across all `L`-unit strings:
 * `c(L) = a·(c(L − 1) + f(L − 1)) + b·(c(L − 2) + f(L − 2))`. A filler from
 * inside the composition produces a string already counted, so only the BMP
 * scalars outside it add new ones.
 *
 * Every length in `[min, max]` is assumed reachable, which holds for every
 * built-in `distribution`; a `custom` one that gives a length zero probability
 * leaves the count too high, and the last strings surface as
 * `UniqueRedrawsError` rather than `UniqueExhaustedError`.
 */
export function toStringDomain(whereby: Whereby): StringDomain {
  const characters = merge(
    toSources(whereby.composition)
      .filter(([weight]) => isDrawable(weight))
      .flatMap(([, source]) => toRanges(source)),
  );
  const { min, max } = effectiveDiscrete(
    whereby.length.min,
    whereby.length.max,
  );

  const one = BigInt(count(characters, 0, 0xffff));
  const two = BigInt(count(characters, 0x10000, Infinity));
  const fillers = BigInt(
    bmpScalars.reduce(
      (total, range) =>
        total
        + (range.to - range.from + 1)
        - count(characters, range.from, range.to),
      0,
    ),
  );

  let capacity = BigInt(0);
  let [f2, c2] = [BigInt(0), BigInt(0)];
  let [f1, c1] = [BigInt(1), BigInt(0)];

  for (let length = 0; length <= max; length++) {
    if (length > 0) {
      const f = one * f1 + two * f2;
      const c = one * (c1 + f1) + two * (c2 + f2);
      const filled = two > BigInt(0) ? fillers * (c1 + f1) : BigInt(0);
      if (length >= min) capacity += f + filled;
      [f2, c2, f1, c1] = [f1, c1, f, c];
    } else if (min === 0) {
      capacity += BigInt(1);
    }
  }

  return {
    capacity,
    admits: (value) => {
      if (typeof value !== "string") return false;
      if (value.length < min || value.length > max) return false;

      let outside = 0;
      for (const char of value) {
        if (contains(characters, char.codePointAt(0)!)) continue;
        if (two === BigInt(0) || !contains(bmpScalars, char.codePointAt(0)!)) {
          return false;
        }
        outside++;
      }
      return outside <= 1;
    },
  };
}

/** Sort and merge ranges into disjoint, ascending ones. */
function merge(ranges: ReadonlyArray<CodepointRange>): CodepointRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged: CodepointRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) {
      merged[merged.length - 1] = {
        from: last.from,
        to: Math.max(last.to, range.to),
      };
    } else {
      merged.push(range);
    }
  }

  return merged;
}

/** How many code points of `ranges` fall within `[from, to]`. */
function count(
  ranges: ReadonlyArray<CodepointRange>,
  from: number,
  to: number,
): number {
  return ranges.reduce((total, range) => {
    const low = Math.max(range.from, from);
    const high = Math.min(range.to, to);
    return high < low ? total : total + high - low + 1;
  }, 0);
}

/** Whether `codepoint` falls in any of the ascending, disjoint `ranges`. */
function contains(
  ranges: ReadonlyArray<CodepointRange>,
  codepoint: number,
): boolean {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle]!;
    if (codepoint < range.from) high = middle - 1;
    else if (codepoint > range.to) low = middle + 1;
    else return true;
  }

  return false;
}
