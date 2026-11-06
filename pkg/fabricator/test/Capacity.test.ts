import { FabricatorError, initialize } from "@ghostry/fabricator";
import { describe, expect, test } from ".";

function draws<$T>(fabricator: { fabricate: () => $T }, count: number): $T[] {
  return Array.from({ length: count }, () => fabricator.fabricate());
}

describe("string capacity", () => {
  test("a BMP composition counts every string of every length", () => {
    const { T, Fabricator } = initialize({
      salt: "capacity-string-bmp",
      clock: new Date(0),
    });
    const schema = T.unique.string.whereby({
      length: { min: 0, max: 2 },
      composition: [[1, "abc"]],
    });

    /** 1 empty + 3 of length one + 9 of length two. */
    const built = new Fabricator(schema);
    expect(new Set(draws(built, 13)).size).toBe(13);
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });

  test("shared characters across sources count once", () => {
    const { T, capacity } = initialize({ salt: "capacity-string-shared" });
    const schema = T.unique.string.whereby({
      length: 1,
      composition: [
        [1, "ab"],
        [2, "bc"],
        [0, "xyz"],
      ],
    });

    expect(capacity(schema)).toBe(BigInt(3));
  });

  /**
   * An astral character takes two UTF-16 units, so a one-unit string holds only
   * a BMP character — here `"a"`, or the filler the fabricator inserts when it
   * draws the astral character with one unit left, which can be any BMP scalar.
   * Two units hold `"aa"`, the astral character, or `"a"` with a filler before
   * or after it.
   */
  test("astral characters take two units, and the filler widens the set", () => {
    const { T, capacity } = initialize({ salt: "capacity-string-astral" });
    const bmpScalars = 0xd800 + (0xffff - 0xe000 + 1);
    const outside = BigInt(bmpScalars - 1);

    expect(
      capacity(
        T.unique.string.whereby({ length: 1, composition: [[1, "a😀"]] }),
      ),
    ).toBe(BigInt(1) + outside);
    expect(
      capacity(
        T.unique.string.whereby({ length: 2, composition: [[1, "a😀"]] }),
      ),
    ).toBe(BigInt(2) + outside * BigInt(2));
  });

  test("a unique array of strings is checked against their capacity at construction", () => {
    const { T, Fabricator } = initialize({ salt: "capacity-string-array" });

    expect(
      () =>
        new Fabricator(
          T.unique
            .array(T.string.whereby({ length: 1, composition: [[1, "ab"]] }))
            .whereby({ length: 3 }),
        ),
    ).toThrow(FabricatorError.UniqueCapacityError);
  });

  test("an override outside the string domain uses up none of it", () => {
    const { T, Fabricator } = initialize({
      salt: "capacity-string-claim",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.object({
        code: T.unique.string.whereby({ length: 1, composition: [[1, "ab"]] }),
      }),
    );

    built.fabricate({ code: "zz" });
    expect(new Set([built.fabricate().code, built.fabricate().code])).toEqual(
      new Set(["a", "b"]),
    );
  });
});

describe("capacity(schema)", () => {
  test("a schema with no unique leaf has no limit", () => {
    const { T, capacity } = initialize({ salt: "capacity-none" });
    expect(capacity(T.object({ a: T.number, b: T.boolean }))).toBeUndefined();
  });

  test("the most limited unique leaf decides", () => {
    const { T, capacity } = initialize({ salt: "capacity-min" });
    const schema = T.object({
      id: T.unique.number.integer.whereby({ min: 1, max: 100 }),
      tag: T.omittable(T.unique.enum.uniform(["a", "b", "c"])),
    });

    expect(capacity(schema)).toBe(BigInt(3));
  });

  test("a leaf inside arrays is divided by how many times one fabrication can reach it", () => {
    const { T, capacity } = initialize({ salt: "capacity-arrays" });
    const id = T.unique.number.integer.whereby({ min: 1, max: 100 });

    expect(
      capacity(T.array(T.object({ id })).whereby({ length: { max: 10 } })),
    ).toBe(BigInt(10));
    expect(
      capacity(
        T.array(T.array(id).whereby({ length: { max: 5 } })).whereby({
          length: 4,
        }),
      ),
    ).toBe(BigInt(5));
  });

  test("fabricating exactly capacity times succeeds, and one more exhausts", () => {
    const { T, Fabricator, capacity } = initialize({
      salt: "capacity-exact",
      clock: new Date(0),
    });
    const schema = T.array(
      T.unique.number.integer.whereby({ min: 1, max: 10 }),
    ).whereby({ length: 3 });

    expect(capacity(schema)).toBe(BigInt(3));

    const built = new Fabricator(schema);
    draws(built, 3);
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });

  test("members of a unique collection, fixed fields, and recursive bodies do not limit it", () => {
    const { T, capacity } = initialize({ salt: "capacity-excluded" });
    const tag = T.unique.enum.uniform(["a", "b"]);

    expect(
      capacity(
        T.unique.array(T.enum.uniform(["a", "b"])).whereby({ length: 2 }),
      ),
    ).toBeUndefined();
    expect(capacity(T.object({ tag }).override({ tag: "a" }))).toBeUndefined();
    expect(
      capacity(
        T.recursive((self) =>
          T.object({ tag, next: T.optional(self) }),
        ).whereby({ depth: { max: 3 } }),
      ),
    ).toBeUndefined();
  });

  test("a hidden field kept for a compute field still counts", () => {
    const { T, capacity } = initialize({ salt: "capacity-hidden" });
    const schema = T.object({
      code: T.unique.enum.uniform(["x", "y"]),
      other: T.number,
    }).refine(({ compute }) => ({
      label: compute(T.string)
        .from(["code"])
        .as(({ fabricated }) => `code ${fabricated.code}`),
    }));

    expect(capacity(T.pick(schema, ["label"]))).toBe(BigInt(2));
  });

  test("leaves of every kind report their size", () => {
    const clock = new Date(1_700_000_000_000);
    const { T, capacity } = initialize({ salt: "capacity-kinds", clock });

    expect(
      capacity(T.unique.bigint.whereby({ min: BigInt(1), max: BigInt(9) })),
    ).toBe(BigInt(9));
    expect(
      capacity(
        T.unique.date.past.whereby({ min: new Date(clock.getTime() - 9) }),
      ),
    ).toBe(BigInt(10));
    expect(
      capacity(T.unique.number.whereby({ min: 0, max: 1 })),
    ).toBeUndefined();
    expect(capacity(T.unique.number.whereby({ min: 2, max: 2 }))).toBe(
      BigInt(1),
    );
    expect(capacity(T.unique.number.integer)).toBe(
      BigInt(Number.MAX_SAFE_INTEGER) * BigInt(2) + BigInt(1),
    );
  });

  test("a built Fabricator is read against its own clock", () => {
    const built = initialize({
      salt: "capacity-built",
      clock: new Date(1000),
    }).Fabricator;
    const { T, capacity } = initialize({
      salt: "capacity-built",
      clock: new Date(5000),
    });
    const schema = T.unique.date.past.whereby({ min: new Date(0) });

    expect(capacity(new built(schema))).toBe(BigInt(1001));
    expect(capacity(schema)).toBe(BigInt(5001));
  });

  test("capacity builds nothing, so it shifts no later draw", () => {
    const a = initialize({ salt: "capacity-pure", clock: "derived" });
    const b = initialize({ salt: "capacity-pure", clock: "derived" });

    b.capacity(b.T.unique.enum.uniform(["x", "y"]));
    expect(new a.Fabricator(a.T.number).fabricate()).toBe(
      new b.Fabricator(b.T.number).fabricate(),
    );
  });
});

describe("enumeration size", () => {
  test("size is how many instances the enumeration yields", () => {
    const { T, combinatorial, coverage } = initialize({
      salt: "capacity-size",
    });
    const schema = T.object({
      flag: T.boolean,
      size: T.enum.uniform(["s", "m", "l"]),
    });

    expect(combinatorial(schema).size).toBe(BigInt(6));
    expect([...combinatorial(schema)].length).toBe(6);
    expect(coverage(schema).size).toBe(BigInt(3));
    expect([...coverage(schema)].length).toBe(3);
  });

  test("capacity against size says whether every instance can stay distinct", () => {
    const { T, coverage, capacity } = initialize({ salt: "capacity-gate" });
    const schema = T.object({
      size: T.enum.uniform(["xs", "s", "m", "l", "xl"]),
      tag: T.unique.enum.uniform(["a", "b"]),
    });

    expect(capacity(schema)! < coverage(schema).size).toBe(true);
  });
});

describe("enumeration errors", () => {
  test("combinatorial and coverage both throw a build error at the call", () => {
    const { T, combinatorial, coverage } = initialize({
      salt: "capacity-eager",
    });
    const schema = T.object({
      tags: T.unique.array(T.boolean).whereby({ length: 3 }),
    });

    expect(() => combinatorial(schema)).toThrow(
      FabricatorError.UniqueCapacityError,
    );
    expect(() => coverage(schema)).toThrow(FabricatorError.UniqueCapacityError);
  });
});
