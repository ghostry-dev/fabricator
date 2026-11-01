/**
 * Faker 10's `lorem` and `word` method bodies, minus the word-list copy.
 *
 * With no `length`, faker's shared `filterWordListByLength` returns
 * `[...wordList]`, so every `lorem.word()` and `word.<category>()` copies a
 * whole locale list (about 1,000 entries in `en`) to index one element, and
 * `lorem.sentence`/`paragraph`/`text` do that once per word. Each word then
 * goes through `helpers.arrayElement` → `number.int({ max })`, which parses an
 * options bag per draw. Every builder in `./Build.ts`'s `lorem`/`word` modules
 * draws through this file instead and never calls faker's own method.
 *
 * The copy is reported upstream as
 * https://github.com/faker-js/faker/issues/4242. A faker release that drops it
 * is the point to weigh calling faker's methods again, not an automatic
 * removal: the per-draw options parsing and definitions lookup would remain.
 *
 * **The output is faker's exactly, not an approximation.** `pick` reads
 * `random.next()` and indexes with `arrayElement`'s own arithmetic,
 * `Math.floor(u * length)`, from the same stream faker's randomizer reads
 * (`src/index.ts`'s `draw` installs one `context` for both). Every draw made
 * once per group rather than once per word — a `count` resolved through
 * `rangeToNumber`, `word.sample`'s shuffle, `slug`'s `slugify` — goes through
 * faker's own helpers, which keeps their semantics (an inverted range's error,
 * a fractional count's truncation) without restating them, at a cost that is
 * off the hot path. So a seed's data is unchanged, the surface keeps faker's
 * `Parameters<...>`, and nothing about this is a deviation in the sense of
 * `AGENTS.md`'s deviation policy. `test/Parity.test.ts` is the guard: it
 * compares every builder here against faker's own method on an identical
 * stream, so a faker release that changes how these draw fails there.
 *
 * Each filtered list is resolved once per builder call, lazily on the first
 * draw, and a throw is never cached: missing locale data (thrown by faker's
 * definitions proxy) and `strategy: "fail"` still throw from `fabricate()` on
 * every call, as faker's own methods do, rather than from the builder call.
 *
 * @module
 */

import type { Faker } from "@faker-js/faker";
import { FakerError } from "@faker-js/faker";
import type { ProduceContext, Stream } from "@ghostry/fabricator";

type Producer = (context: ProduceContext) => string;

type WordOptions = Parameters<Faker["word"]["noun"]>[0];

type Count = NonNullable<Parameters<Faker["lorem"]["words"]>[0]>;

/** Draws the next word; what the `lorem` compositions repeat. */
type Word = () => string;

/**
 * Faker's `WordModule` declares its category methods in this order, and
 * `word.sample` shuffles them as declared — so the order is part of which
 * category a given draw lands on, not just a listing.
 */
const categories = [
  "adjective",
  "adverb",
  "conjunction",
  "interjection",
  "noun",
  "preposition",
  "verb",
] as const;

type Category = (typeof categories)[number];

/**
 * Faker's private `filterWordListByLength`, returning `list` itself where faker
 * returns a copy. `closest` reads the nearest lengths below and above the range
 * directly rather than grouping by length first; both find the same two
 * bounds.
 */
function filterByLength(
  list: ReadonlyArray<string>,
  options: WordOptions = {},
): ReadonlyArray<string> {
  const { length, strategy = "fail" } =
    typeof options === "number" ? { length: options } : options;

  if (length === undefined) {
    if (strategy === "shortest" || strategy === "longest") {
      return extreme(list, strategy);
    }
    return list;
  }

  const range =
    typeof length === "number" ? { min: length, max: length } : length;
  const matching = list.filter(
    (word) => word.length >= range.min && word.length <= range.max,
  );
  if (matching.length > 0) return matching;

  switch (strategy) {
    case "fail":
      throw new FakerError("No words found that match the given length.");
    case "closest":
      return closest(list, range);
    case "shortest":
    case "longest":
      return extreme(list, strategy);
    case "any-length":
      return list;
  }
}

function extreme(
  list: ReadonlyArray<string>,
  strategy: "shortest" | "longest",
): ReadonlyArray<string> {
  const lengths = list.map((word) => word.length);
  const target =
    strategy === "shortest" ? Math.min(...lengths) : Math.max(...lengths);
  return list.filter((word) => word.length === target);
}

function closest(
  list: ReadonlyArray<string>,
  range: { min: number; max: number },
): ReadonlyArray<string> {
  let below = -Infinity;
  let above = Infinity;
  for (const { length } of list) {
    if (length < range.min && length > below) below = length;
    if (length > range.max && length < above) above = length;
  }
  const offset = Math.min(range.min - below, above - range.max);
  return list.filter(
    ({ length }) =>
      length === range.min - offset || length === range.max + offset,
  );
}

/**
 * `read()` filtered by `options`, resolved on first use and kept. Only a result
 * is kept: a throw propagates on every call.
 */
function listOf(
  read: () => ReadonlyArray<string>,
  options: WordOptions,
): () => ReadonlyArray<string> {
  let resolved: ReadonlyArray<string> | undefined;
  return () => {
    if (resolved === undefined) resolved = filterByLength(read(), options);
    return resolved;
  };
}

/**
 * `helpers.arrayElement`, drawing from `random` directly. `number.int({ max:
 * length - 1 })` reduces to `Math.floor(u * length)` for a whole `max` and the
 * default `min`/`multipleOf`, and a one-element list draws nothing.
 */
function pick<$T>(random: Stream, list: ReadonlyArray<$T>): $T {
  if (list.length === 0) {
    throw new FakerError("Cannot get value from empty dataset.");
  }
  return list[list.length > 1 ? Math.floor(random.next() * list.length) : 0]!;
}

export function toWords(faker: Faker) {
  const repeat = (count: Count, separator: string, next: () => string) =>
    faker.helpers.multiple(next, { count }).join(separator);

  const words = (word: Word, count: Count = 3) => repeat(count, " ", word);

  const sentence = (word: Word, count: Count = { min: 3, max: 10 }) => {
    const text = words(word, count);
    return `${text.charAt(0).toUpperCase()}${text.substring(1)}.`;
  };

  const sentences = (
    word: Word,
    count: Count = { min: 2, max: 6 },
    separator = " ",
  ) => repeat(count, separator, () => sentence(word));

  const paragraph = (word: Word, count: Count = 3) => sentences(word, count);

  const paragraphs = (word: Word, count: Count = 3, separator = "\n") =>
    repeat(count, separator, () => paragraph(word));

  const lines = (word: Word, count: Count = { min: 1, max: 5 }) =>
    sentences(word, count, "\n");

  /** `lorem.text`'s choices, in the order faker lists them. */
  const texts: ReadonlyArray<(word: Word) => string> = [
    sentence,
    sentences,
    paragraph,
    paragraphs,
    lines,
  ];

  /**
   * A `lorem` producer: one memoized `lorem.word` list per builder call, and a
   * `Word` over it per draw for `compose` to repeat.
   */
  const lorem = (compose: (word: Word, random: Stream) => string) => {
    const list = listOf(() => faker.definitions.lorem.word, undefined);
    return ({ random }: ProduceContext) =>
      compose(() => pick(random, list()), random);
  };

  const category =
    (name: Category) =>
    (options?: WordOptions): Producer => {
      const list = listOf(() => faker.definitions.word[name], options);
      return ({ random }) => pick(random, list());
    };

  /**
   * `word.sample`: the categories in faker's shuffled order, taking the first
   * that yields a word. Catches everything, as faker's does, so a category the
   * locale lacks and a length `strategy: "fail"` cannot meet are both skipped.
   */
  const sampler = (options: WordOptions) => {
    const lists = categories.map((name) =>
      listOf(() => faker.definitions.word[name], options),
    );
    return (random: Stream): string => {
      for (const list of faker.helpers.shuffle(lists)) {
        try {
          return pick(random, list());
        } catch {
          continue;
        }
      }
      throw new FakerError(
        "No matching word data available for the current locale",
      );
    };
  };

  return {
    lorem: {
      lines: (count?: Count): Producer => lorem((word) => lines(word, count)),
      paragraph: (count?: Count): Producer =>
        lorem((word) => paragraph(word, count)),
      paragraphs: (count?: Count, separator?: string): Producer =>
        lorem((word) => paragraphs(word, count, separator)),
      sentence: (count?: Count): Producer =>
        lorem((word) => sentence(word, count)),
      sentences: (count?: Count, separator?: string): Producer =>
        lorem((word) => sentences(word, count, separator)),
      slug: (count?: Count): Producer =>
        lorem((word) => faker.helpers.slugify(words(word, count))),
      text: (): Producer => lorem((word, random) => pick(random, texts)(word)),
      word: (options?: WordOptions): Producer => {
        const list = listOf(() => faker.definitions.lorem.word, options);
        return ({ random }) => pick(random, list());
      },
      words: (count?: Count): Producer => lorem((word) => words(word, count)),
    },
    word: {
      adjective: category("adjective"),
      adverb: category("adverb"),
      conjunction: category("conjunction"),
      interjection: category("interjection"),
      noun: category("noun"),
      preposition: category("preposition"),
      sample: (options?: WordOptions): Producer => {
        const sample = sampler(options);
        return ({ random }) => sample(random);
      },
      verb: category("verb"),
      words: (
        options: Parameters<Faker["word"]["words"]>[0] = {},
      ): Producer => {
        const { count = { min: 1, max: 3 } } =
          typeof options === "number" ? { count: options } : options;
        const sample = sampler(undefined);
        return ({ random }) => repeat(count, " ", () => sample(random));
      },
    },
  };
}
