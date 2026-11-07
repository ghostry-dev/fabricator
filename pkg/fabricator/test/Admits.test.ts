/**
 * `.admits(...)` states what adapters admit, widening what `whereby` draws.
 * Adapter output is asserted in the TypeBox package's own `Admits.test.ts`.
 *
 * @module
 */

import { FabricatorError, initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";
import { attest, describe, expect, test } from ".";

const inclusive = <$T>(value: $T) => ({ value, exclusive: false });

describe("storage", () => {
  test("nothing is stored until .admits is called", () => {
    const { T } = initialize({ salt: "admits-absent" });

    expect("admits" in T.string.whereby({ length: 3 })[Meta]).toBe(false);
    expect("admits" in T.number[Meta]).toBe(false);
  });

  test("an omitted end keeps the drawn one, and Infinity drops an end", () => {
    const { T } = initialize({ salt: "admits-resolve" });

    const schema = T.string
      .whereby({ length: { min: 1, max: 40 } })
      .admits({ length: { max: Infinity } });
    expect(schema[Meta].admits).toEqual({ length: { min: inclusive(1) } });

    const bigint = T.bigint
      .whereby({ min: 0, max: 10 })
      .admits({ min: -Infinity, max: 1000 });
    expect(bigint[Meta].admits).toEqual({ max: inclusive(BigInt(1000)) });
  });

  test("successive calls merge per end", () => {
    const { T } = initialize({ salt: "admits-merge" });

    const schema = T.array(T.always(1))
      .whereby({ length: { min: 2, max: 5 } })
      .admits({ length: { min: 0 } })
      .admits({ length: { max: 1000 } });

    expect(schema[Meta].admits).toEqual({
      length: { min: inclusive(0), max: inclusive(1000) },
    });
  });

  test(".as and .adapt carry admits forward", () => {
    const { T } = initialize({ salt: "admits-carry" });

    const schema = T.number
      .whereby({ min: 0, max: 9 })
      .admits({ max: Infinity })
      .as(() => 1);

    expect(schema[Meta].admits).toEqual({ min: inclusive(0) });
  });

  test("fabrication is unchanged", () => {
    const left = initialize({ salt: "admits-draws", clock: "derived" });
    const right = initialize({ salt: "admits-draws", clock: "derived" });

    const plain = new left.Fabricator(
      left.T.string.whereby({ length: { min: 1, max: 5 } }),
    );
    const admitted = new right.Fabricator(
      right.T.string
        .whereby({ length: { min: 1, max: 5 } })
        .admits({ length: { min: 0, max: Infinity } }),
    );

    expect(Array.from({ length: 20 }, () => admitted.fabricate())).toEqual(
      Array.from({ length: 20 }, () => plain.fabricate()),
    );
  });
});

describe("widen only", () => {
  test("an end that excludes drawn values throws", () => {
    const { T } = initialize({ salt: "admits-narrow" });

    const error = attest.throws(FabricatorError.AdmitsExcludesDrawError, () =>
      T.string.whereby({ length: { max: 40 } }).admits({ length: { max: 10 } }),
    );
    expect(error.end).toBe("length.max");
    expect(error.label).toBe(".admits on a string schema");

    expect(() =>
      T.number.whereby({ min: 0, max: 9 }).admits({ min: 1 }),
    ).toThrow(FabricatorError.AdmitsExcludesDrawError);
  });

  test("whole-number ends compare as the integers they leave", () => {
    const { T } = initialize({ salt: "admits-discrete" });

    /** Exclusive 0 admits 1 and up, which is all a min of 1 draws. */
    expect(() =>
      T.array(T.always(1))
        .whereby({ length: { min: 1, max: 5 } })
        .admits({ length: { min: { value: 0, exclusive: true } } }),
    ).not.toThrow();
    expect(() =>
      T.number.integer
        .whereby({ min: 0, max: 9 })
        .admits({ max: { value: 10, exclusive: true } }),
    ).not.toThrow();
  });

  test("a continuous end must be no more exclusive than the drawn one", () => {
    const { T } = initialize({ salt: "admits-continuous" });

    expect(() =>
      T.number
        .whereby({ min: 0, max: 1 })
        .admits({ min: { value: 0, exclusive: true } }),
    ).toThrow(FabricatorError.AdmitsExcludesDrawError);
    expect(() =>
      T.number
        .whereby({ min: { value: 0, exclusive: true }, max: 1 })
        .admits({ min: 0 }),
    ).not.toThrow();
  });

  test("an unbounded drawn end admits only no limit", () => {
    const { T } = initialize({ salt: "admits-unbounded" });

    const error = attest.throws(FabricatorError.AdmitsExcludesDrawError, () =>
      T.number.admits({ max: Number.MAX_SAFE_INTEGER }),
    );
    expect(error.fabricated).toBeUndefined();

    expect(() =>
      T.date.whereby({ min: 0 }).admits({ max: Date.UTC(2100, 0) }),
    ).toThrow(FabricatorError.AdmitsExcludesDrawError);
    expect(() => T.number.integer.sequence.admits({ min: 0 })).not.toThrow();
    expect(() => T.number.integer.sequence.admits({ max: 1e9 })).toThrow(
      FabricatorError.AdmitsExcludesDrawError,
    );
  });

  test("past and future leave the clock's end unbounded", () => {
    const { T } = initialize({ salt: "admits-clock" });
    const min = Date.UTC(2000, 0, 1);

    expect(
      T.date.past.whereby({ min }).admits({ min: Date.UTC(1990, 0, 1) })[Meta]
        .admits,
    ).toEqual({ min: inclusive(new Date(Date.UTC(1990, 0, 1))) });
    expect(() =>
      T.date.future.whereby({ max: Date.UTC(2100, 0) }).admits({ max: min }),
    ).toThrow(FabricatorError.AdmitsExcludesDrawError);
  });

  test("a plain record admits only what survives collisions", () => {
    const { T } = initialize({ salt: "admits-record" });
    const key = T.string.whereby({ length: 1, composition: [[1, "ab"]] });

    expect(
      T.record(key, T.always(1))
        .whereby({ size: { minTried: 3, max: 8 } })
        .admits({ size: { min: 1 } })[Meta].admits,
    ).toEqual({ size: { min: inclusive(1), max: inclusive(8) } });
    expect(() =>
      T.record(key, T.always(1))
        .whereby({ size: { minTried: 3, max: 8 } })
        .admits({ size: { min: 2 } }),
    ).toThrow(FabricatorError.AdmitsExcludesDrawError);
    expect(() =>
      T.record(key, T.always(1))
        .whereby({ size: { max: 8 } })
        .admits({ size: { min: 1 } }),
    ).toThrow(FabricatorError.AdmitsExcludesDrawError);
    expect(() =>
      T.unique
        .record(T.string.whereby({ length: 4 }), T.always(1))
        .whereby({ size: { min: 2, max: 4 } })
        .admits({ size: { min: 2 } }),
    ).not.toThrow();
  });

  test("under .as(produce) nothing is checked", () => {
    const { T } = initialize({ salt: "admits-produce" });

    expect(
      T.string.as(() => "x").admits({ length: { max: 255 } })[Meta].admits,
    ).toEqual({ length: { max: inclusive(255) } });
    expect(() =>
      T.bigint
        .whereby({ max: 10 })
        .as(() => BigInt(0))
        .admits({ max: 1 }),
    ).not.toThrow();
  });
});

describe("keywords", () => {
  test("format and pattern are stored beside the length and merge per key", () => {
    const { T } = initialize({ salt: "admits-keywords" });

    const schema = T.string
      .as(() => "a@b.c")
      .admits({ format: "email" })
      .admits({ pattern: "@", length: { max: 255 } });

    expect(schema[Meta].admits).toEqual({
      format: "email",
      pattern: "@",
      length: { max: inclusive(255) },
    });
  });

  test("keywords are not checked against what is drawn", () => {
    const { T } = initialize({ salt: "admits-keywords-unchecked" });

    expect(
      T.string
        .whereby({ length: 3, composition: { lowercase: 1 } })
        .admits({ pattern: "^[0-9]+$" })[Meta].admits?.pattern,
    ).toBe("^[0-9]+$");
    expect(
      T.number.integer.whereby({ min: 0, max: 9 }).admits({ multipleOf: 2 })[
        Meta
      ].admits,
    ).toEqual({ min: inclusive(0), max: inclusive(9), multipleOf: 2 });
  });
});

describe("conversion", () => {
  test("bigint and date ends accept numbers, as in whereby", () => {
    const { T } = initialize({ salt: "admits-numbers" });

    expect(
      T.bigint.whereby({ max: 5 }).admits({ max: 9 })[Meta].admits,
    ).toEqual({ min: inclusive(BigInt(-5)), max: inclusive(BigInt(9)) });
    expect(
      T.date
        .whereby({ min: Date.UTC(2000, 0), max: Date.UTC(2001, 0) })
        .admits({ min: Date.UTC(1999, 0) })[Meta].admits?.min,
    ).toEqual(inclusive(new Date(Date.UTC(1999, 0))));
  });

  test("a non-finite end other than the no-limit side throws", () => {
    const { T } = initialize({ salt: "admits-invalid" });

    for (const value of [Number.NaN, -Infinity]) {
      const error = attest.throws(FabricatorError.InvalidBoundError, () =>
        T.number.whereby({ max: 1 }).admits({ max: value }),
      );
      expect(error.end).toBe("max");
    }
    expect(() => T.bigint.whereby({ max: 5 }).admits({ max: 9.5 })).toThrow(
      FabricatorError.InvalidBoundError,
    );
  });
});
