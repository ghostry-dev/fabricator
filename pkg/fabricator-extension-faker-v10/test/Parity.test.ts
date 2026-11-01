/**
 * `lorem`'s and `word`'s builders reimplement faker's method bodies rather than
 * calling them (`src/FakerModules/Words.ts`), and promise faker's output
 * exactly. Each case builds the builder and `use.string` around faker's own
 * method with the same pinned trace: both are `string` at path `[]` on one
 * instance, so both draw from an identical stream, and any difference is the
 * reimplementation's. A faker release that changes how these draw fails here.
 *
 * @module
 */

import type { Faker, LocaleDefinition } from "@faker-js/faker";
import { base, en, FakerError, ko } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import type { FakerTypes } from "@ghostry/fabricator-extension-faker-v10";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { describe, expect, test } from "bun:test";

type Builder = (F: FakerTypes) => ReturnType<FakerTypes["lorem"]["word"]>;
type Case = readonly [
  label: string,
  ours: Builder,
  theirs: (f: Faker) => string,
];

const salts = Array.from({ length: 200 }, (_, i) => `parity-${i}`);

const instance = (locale: LocaleDefinition | LocaleDefinition[]) =>
  initialize({
    salt: "parity",
    clock: "derived",
    types: registry.extend(fakerExtension({ locale })),
  });

function parity(
  cases: ReadonlyArray<Case>,
  { T, Fabricator }: ReturnType<typeof instance>,
) {
  test.each(cases)("%s", (_, ours, theirs) => {
    for (const salt of salts) {
      const pin = { salt, ordinal: 0 };
      const a = new Fabricator(ours(T.faker), pin);
      const b = new Fabricator(T.faker.use.string(theirs), pin);

      expect([a.fabricate(), a.fabricate(), a.fabricate()]).toEqual([
        b.fabricate(),
        b.fabricate(),
        b.fabricate(),
      ]);
    }
  });
}

describe("en", () => {
  parity(
    [
      ["lorem.word()", (F) => F.lorem.word(), (f) => f.lorem.word()],
      ["lorem.word(5)", (F) => F.lorem.word(5), (f) => f.lorem.word(5)],
      [
        "lorem.word({ length: { min: 3, max: 4 } })",
        (F) => F.lorem.word({ length: { min: 3, max: 4 } }),
        (f) => f.lorem.word({ length: { min: 3, max: 4 } }),
      ],
      [
        "lorem.word closest, above every word",
        (F) => F.lorem.word({ length: 30, strategy: "closest" }),
        (f) => f.lorem.word({ length: 30, strategy: "closest" }),
      ],
      [
        "lorem.word closest, below every word",
        (F) =>
          F.lorem.word({ length: { min: 0, max: 1 }, strategy: "closest" }),
        (f) =>
          f.lorem.word({ length: { min: 0, max: 1 }, strategy: "closest" }),
      ],
      [
        "lorem.word shortest, unmatched",
        (F) => F.lorem.word({ length: 30, strategy: "shortest" }),
        (f) => f.lorem.word({ length: 30, strategy: "shortest" }),
      ],
      [
        "lorem.word longest, unmatched",
        (F) => F.lorem.word({ length: 30, strategy: "longest" }),
        (f) => f.lorem.word({ length: 30, strategy: "longest" }),
      ],
      [
        "lorem.word any-length, unmatched",
        (F) => F.lorem.word({ length: 30, strategy: "any-length" }),
        (f) => f.lorem.word({ length: 30, strategy: "any-length" }),
      ],
      [
        "lorem.word shortest, no length",
        (F) => F.lorem.word({ strategy: "shortest" }),
        (f) => f.lorem.word({ strategy: "shortest" }),
      ],
      ["lorem.words()", (F) => F.lorem.words(), (f) => f.lorem.words()],
      ["lorem.words(5)", (F) => F.lorem.words(5), (f) => f.lorem.words(5)],
      [
        "lorem.words({ min: 1, max: 4 })",
        (F) => F.lorem.words({ min: 1, max: 4 }),
        (f) => f.lorem.words({ min: 1, max: 4 }),
      ],
      [
        "lorem.sentence()",
        (F) => F.lorem.sentence(),
        (f) => f.lorem.sentence(),
      ],
      [
        "lorem.sentence(4)",
        (F) => F.lorem.sentence(4),
        (f) => f.lorem.sentence(4),
      ],
      [
        "lorem.sentences()",
        (F) => F.lorem.sentences(),
        (f) => f.lorem.sentences(),
      ],
      [
        'lorem.sentences(3, "|")',
        (F) => F.lorem.sentences(3, "|"),
        (f) => f.lorem.sentences(3, "|"),
      ],
      [
        "lorem.paragraph()",
        (F) => F.lorem.paragraph(),
        (f) => f.lorem.paragraph(),
      ],
      [
        "lorem.paragraph({ min: 1, max: 3 })",
        (F) => F.lorem.paragraph({ min: 1, max: 3 }),
        (f) => f.lorem.paragraph({ min: 1, max: 3 }),
      ],
      [
        "lorem.paragraphs()",
        (F) => F.lorem.paragraphs(),
        (f) => f.lorem.paragraphs(),
      ],
      [
        'lorem.paragraphs(2, "--")',
        (F) => F.lorem.paragraphs(2, "--"),
        (f) => f.lorem.paragraphs(2, "--"),
      ],
      ["lorem.lines()", (F) => F.lorem.lines(), (f) => f.lorem.lines()],
      ["lorem.text()", (F) => F.lorem.text(), (f) => f.lorem.text()],
      ["lorem.slug()", (F) => F.lorem.slug(), (f) => f.lorem.slug()],
      ["lorem.slug(4)", (F) => F.lorem.slug(4), (f) => f.lorem.slug(4)],
      [
        "word.adjective()",
        (F) => F.word.adjective(),
        (f) => f.word.adjective(),
      ],
      ["word.adverb()", (F) => F.word.adverb(), (f) => f.word.adverb()],
      [
        "word.conjunction()",
        (F) => F.word.conjunction(),
        (f) => f.word.conjunction(),
      ],
      [
        "word.interjection()",
        (F) => F.word.interjection(),
        (f) => f.word.interjection(),
      ],
      ["word.noun()", (F) => F.word.noun(), (f) => f.word.noun()],
      [
        "word.preposition()",
        (F) => F.word.preposition(),
        (f) => f.word.preposition(),
      ],
      ["word.verb()", (F) => F.word.verb(), (f) => f.word.verb()],
      ["word.noun(5)", (F) => F.word.noun(5), (f) => f.word.noun(5)],
      [
        "word.verb closest",
        (F) =>
          F.word.verb({ length: { min: 30, max: 40 }, strategy: "closest" }),
        (f) =>
          f.word.verb({ length: { min: 30, max: 40 }, strategy: "closest" }),
      ],
      ["word.sample()", (F) => F.word.sample(), (f) => f.word.sample()],
      ["word.sample(4)", (F) => F.word.sample(4), (f) => f.word.sample(4)],
      ["word.words()", (F) => F.word.words(), (f) => f.word.words()],
      ["word.words(5)", (F) => F.word.words(5), (f) => f.word.words(5)],
      [
        "word.words({ count: { min: 2, max: 4 } })",
        (F) => F.word.words({ count: { min: 2, max: 4 } }),
        (f) => f.word.words({ count: { min: 2, max: 4 } }),
      ],
    ],
    instance(en),
  );
});

/**
 * `ko` has no conjunction, interjection, preposition, or verb, so `sample`
 * skips whichever of those its shuffle puts first.
 */
describe("a locale missing word categories", () => {
  parity(
    [
      ["word.sample()", (F) => F.word.sample(), (f) => f.word.sample()],
      ["word.words()", (F) => F.word.words(), (f) => f.word.words()],
    ],
    instance([ko, base]),
  );
});

describe("errors", () => {
  const caught = (fabricate: () => unknown): unknown => {
    try {
      fabricate();
    } catch (error) {
      return error;
    }
    return undefined;
  };

  test.each([
    [
      "a length no word meets, under the default strategy",
      instance(en),
      ((F) => F.lorem.word({ length: 50 })) satisfies Builder,
      (f: Faker) => f.lorem.word({ length: 50 }),
    ],
    [
      "a category the locale lacks",
      instance([ko, base]),
      ((F) => F.word.verb()) satisfies Builder,
      (f: Faker) => f.word.verb(),
    ],
  ] as const)(
    "%s throws faker's own error from fabricate(), not from the builder",
    (_, { T, Fabricator }, ours, theirs) => {
      const schema = ours(T.faker);
      const a = new Fabricator(schema);
      const b = new Fabricator(T.faker.use.string(theirs));

      const expected = caught(() => b.fabricate());
      const actual = caught(() => a.fabricate());

      expect(expected).toBeInstanceOf(FakerError);
      expect(actual).toBeInstanceOf(FakerError);
      expect((actual as Error).message).toBe((expected as Error).message);
    },
  );
});
