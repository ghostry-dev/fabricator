import type { AdaptationsOf } from "../../Adapter/Types";
import { effectiveDiscrete } from "../../Bound";
import { weighted } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Stream, Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Kind, Meta, type Adaptation } from "../../Types";
import { inline } from "../../Utility/Core";
import { classes, unicode } from "./Constants";
import { Schema } from "./Schema";
import type {
  CharacterClass,
  CharacterSource,
  CodepointRange,
  Fabricated,
  Meta as ThisMeta,
} from "./Types";

export type Fabrication<_ extends Fabricator> = Fabricated;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated> & {
  [Kind]: "string";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta], AdaptationsOf<$Schema>>;
};

/**
 * Turn a `string` Schema into a live Fabricator — the one place this kind's
 * character-generation logic actually runs. `Constructor.ts` calls this once
 * per `construct()`, never from inside the returned `fabricate`.
 */
export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "string",
      [Meta]: meta,
      trace,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);
  const whereby = meta.whereby;
  const { min, max } = effectiveDiscrete(
    whereby.length.min,
    whereby.length.max,
  );

  const sources = inline((): ReadonlyArray<[number, CharacterSource]> => {
    const composition = whereby.composition;
    if (composition === undefined) return [[1, unicode.scalars]];
    if (Array.isArray(composition)) return composition;

    return Object.entries(composition).map(
      ([name, weight]): [number, CharacterSource] => [
        weight as number,
        classes[name as CharacterClass],
      ],
    );
  });

  const pick = weighted(
    sources.map(([weight, source]): [number, () => string] => [
      weight,
      compiler(source, stream),
    ]),
    stream,
    "T.string.whereby.composition",
  );

  /** A single well-formed BMP character (always one UTF-16 code unit). */
  const fill = compiler(bmpScalars, stream);

  const fabricate = (): string => {
    const length = min + Math.floor(stream.next() * (max - min + 1));

    /**
     * Spend a budget of UTF-16 code units so the joined result's `.length`
     * lands on `length` exactly. A drawn unit is placed only if it fits the
     * remaining budget; when it is too wide (an astral, two-unit character with
     * one unit of room left), a single BMP character tops up instead — spliced
     * in at a random character boundary rather than always at the end, and
     * never inside a multi-unit character.
     */
    const pieces: string[] = [];
    let remaining = length;
    while (remaining > 0) {
      const unit = pick()();

      if (unit.length <= remaining) {
        pieces.push(unit);
        remaining -= unit.length;
      } else {
        const at = Math.floor(stream.next() * (pieces.length + 1));
        pieces.splice(at, 0, fill());
        remaining -= 1;
      }
    }

    return pieces.join("");
  };

  return {
    [Kind]: "string",
    [Meta]: meta,
    trace,
    fabricate,
    schema: rehydrated,
  };
}

/** Normalize any character source to its underlying code point ranges. */
const toRanges = (source: CharacterSource): ReadonlyArray<CodepointRange> => {
  if (typeof source === "string") {
    return [...source].map((char): CodepointRange => {
      const codepoint = char.codePointAt(0)!;
      return { from: codepoint, to: codepoint };
    });
  }
  if (Array.isArray(source)) return source;
  return [source as CodepointRange];
};

/**
 * Single-UTF-16-unit, well-formed code points (the BMP minus surrogates). Used
 * to top up a length budget when a drawn unit is too wide to fit the remaining
 * space (see `fabricate`).
 */
const bmpScalars: ReadonlyArray<CodepointRange> = [
  { from: 0x0, to: 0xd7ff },
  { from: 0xe000, to: 0xffff },
];

/**
 * Compile a source into a generator of single characters: pick one of its
 * ranges weighted by size (so the code point is uniform across the whole
 * source), then a code point uniformly within that range.
 */
const compiler = (source: CharacterSource, stream: Stream): (() => string) => {
  const pick = weighted(
    toRanges(source).map((range): [number, CodepointRange] => [
      range.to - range.from + 1,
      range,
    ]),
    stream,
    "T.string.whereby",
  );

  return () => {
    const range = pick();
    const span = range.to - range.from + 1;
    return String.fromCodePoint(range.from + Math.floor(stream.next() * span));
  };
};
