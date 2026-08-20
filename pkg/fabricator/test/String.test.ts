import { expect, test } from "bun:test";
import { FabricatorError, initialize } from "@ghostry/fabricator";

/**
 * `length` counts UTF-16 code units, so `.length` must equal the chosen length
 * exactly — not merely fall within it — even when astral characters are in play
 * (see `string/Fabricator.ts`'s top-up path).
 */
test("T.string.whereby length is exact, not just bounded", () => {
  const { T, Fabricator } = initialize({ seed: "string-length-exact" });

  const built = new Fabricator(
    T.string.whereby({ length: { min: 5, max: 5 } }),
  );

  for (let i = 0; i < 2000; i++) {
    expect(built.fabricate().length).toBe(5);
  }
});

test("T.string.whereby length spans the full [min, max] range, inclusive", () => {
  const { T, Fabricator } = initialize({ seed: "string-length-range" });

  const built = new Fabricator(
    T.string.whereby({ length: { min: 2, max: 4 } }),
  );

  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) {
    const value = built.fabricate();
    expect(value.length).toBeGreaterThanOrEqual(2);
    expect(value.length).toBeLessThanOrEqual(4);
    seen.add(value.length);
  }

  expect(seen).toEqual(new Set([2, 3, 4]));
});

test("exclusive string length.min never yields the excluded length", () => {
  const { T, Fabricator } = initialize({ seed: "string-exclusive-min" });
  const built = new Fabricator(
    T.string.whereby({
      length: { min: { value: 0, exclusive: true }, max: 2 },
    }),
  );

  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) seen.add(built.fabricate().length);
  expect(seen.has(0)).toBe(false);
  expect(seen).toEqual(new Set([1, 2]));
});

test("an empty string length range throws at whereby", () => {
  const { T } = initialize({ seed: "string-empty-length" });
  expect(() =>
    T.string.whereby({
      length: { min: { value: 3, exclusive: true }, max: 3 },
    }),
  ).toThrow(FabricatorError.EmptyRangeError);
});

test("length.min defaults to 0, so an empty string is reachable", () => {
  const { T, Fabricator } = initialize({ seed: "string-length-default-min" });

  const built = new Fabricator(T.string.whereby({ length: { max: 2 } }));

  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) {
    seen.add(built.fabricate().length);
  }

  expect(seen.has(0)).toBe(true);
});

/**
 * The default composition (`unicode.scalars`) excludes the surrogate block, so
 * the result is always well-formed UTF-16 — no lone surrogates, even when
 * astral (two-code-unit) characters are drawn and the top-up path splices in a
 * filler character.
 */
test("the default composition never produces lone surrogates", () => {
  const { T, Fabricator } = initialize({ seed: "string-well-formed" });

  const built = new Fabricator(
    T.string.whereby({ length: { min: 1, max: 9 } }),
  );

  for (let i = 0; i < 3000; i++) {
    const value = built.fabricate();
    // A string round-trips through `[...value]` (code-point iteration)
    // cleanly only if it contains no lone surrogates.
    const codepoints = [...value];
    const reassembled = codepoints.join("");
    expect(reassembled).toBe(value);
    for (const ch of codepoints) {
      const cp = ch.codePointAt(0)!;
      expect(cp < 0xd800 || cp > 0xdfff).toBe(true);
    }
  }
});

/**
 * Forcing an all-astral composition against odd target lengths is what actually
 * exercises the top-up path: a two-unit character can't fill a one-unit gap, so
 * a well-formed BMP filler must be spliced in instead of the result silently
 * overshooting or landing on an ill-formed pair.
 */
test("an all-astral composition still hits every requested length exactly", () => {
  const { T, Fabricator } = initialize({ seed: "string-topup" });

  // U+10000-U+10FFFF: entirely astral, i.e. every drawn character is 2 code units.
  const built = new Fabricator(
    T.string.whereby({
      length: { min: 1, max: 7 },
      composition: [[1, { from: 0x10000, to: 0x10ffff }]],
    }),
  );

  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) {
    const value = built.fabricate();
    expect(value.length).toBeGreaterThanOrEqual(1);
    expect(value.length).toBeLessThanOrEqual(7);
    seen.add(value.length);

    // The reassembled-from-codepoints check also catches an ill-formed
    // splice (e.g. a filler landing inside a surrogate pair).
    expect([...value].join("")).toBe(value);
  }

  // Every length 1..7 must be reachable, odd ones only via a top-up.
  expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
});

/**
 * `composition` weights describe the string's _expected_ composition, not
 * per-character uniformity — each character independently rolls a source by
 * weight. A heavily skewed weighting should still visibly skew the output.
 */
test("composition proportions are honored", () => {
  const { T, Fabricator } = initialize({ seed: "string-composition" });

  const built = new Fabricator(
    T.string.whereby({
      length: { min: 200, max: 200 },
      composition: { digit: 9, lowercase: 1 },
    }),
  );

  let digits = 0;
  let lowercase = 0;
  let other = 0;

  for (let i = 0; i < 50; i++) {
    for (const ch of built.fabricate()) {
      if (ch >= "0" && ch <= "9") digits++;
      else if (ch >= "a" && ch <= "z") lowercase++;
      else other++;
    }
  }

  expect(other).toBe(0);
  const total = digits + lowercase;
  expect(total).toBe(200 * 50);

  // Expect roughly 90/10, allow generous slack for randomness.
  const digitRatio = digits / total;
  expect(digitRatio).toBeGreaterThan(0.8);
  expect(digitRatio).toBeLessThan(0.98);
});

/**
 * A named character class alone (no explicit weight object) is a valid
 * composition.
 */
test("a single named class composition only draws from that class", () => {
  const { T, Fabricator } = initialize({ seed: "string-single-class" });

  const built = new Fabricator(
    T.string.whereby({
      length: { min: 20, max: 20 },
      composition: { uppercase: 1 },
    }),
  );

  for (let i = 0; i < 200; i++) {
    for (const ch of built.fabricate()) {
      expect(ch >= "A" && ch <= "Z").toBe(true);
    }
  }
});
