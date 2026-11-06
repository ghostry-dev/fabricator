import { isArray } from "../../Utility/Core";
import { classes, unicode } from "./Constants";
import type {
  CharacterClass,
  CharacterSource,
  CodepointRange,
  Composition,
} from "./Types";

/**
 * A composition as weighted character sources — the shape `Fabricator.ts` draws
 * from and `Capacity.ts` counts. No composition is every Unicode scalar value;
 * a class-name record maps each name to its preset ranges.
 */
export function toSources(
  composition: Composition | undefined,
): ReadonlyArray<readonly [number, CharacterSource]> {
  if (composition === undefined) return [[1, unicode.scalars]];
  if (Array.isArray(composition)) return composition;

  return Object.entries(composition).map(
    ([name, weight]): [number, CharacterSource] => [
      weight as number,
      classes[name as CharacterClass],
    ],
  );
}

/** Normalize any character source to its underlying code point ranges. */
export function toRanges(
  source: CharacterSource,
): ReadonlyArray<CodepointRange> {
  if (typeof source === "string") {
    return [...source].map((char): CodepointRange => {
      const codepoint = char.codePointAt(0)!;
      return { from: codepoint, to: codepoint };
    });
  }
  if (isArray(source)) return source;
  return [source];
}

/**
 * Single-UTF-16-unit, well-formed code points (the BMP minus surrogates). Used
 * to top up a length budget when a drawn unit is too wide to fit the remaining
 * space (`Fabricator.ts`'s `fabricate`), which also puts them in the set of
 * strings `Capacity.ts` counts.
 */
export const bmpScalars: ReadonlyArray<CodepointRange> = [
  { from: 0x0, to: 0xd7ff },
  { from: 0xe000, to: 0xffff },
];
