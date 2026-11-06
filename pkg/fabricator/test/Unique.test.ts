import {
  FabricatorError,
  Omitted,
  initialize,
  layer,
} from "@ghostry/fabricator";
import { attest, describe, expect, test } from ".";

const salts = Array.from({ length: 20 }, (_, i) => `unique-${i}`);

function draws<$T>(fabricator: { fabricate: () => $T }, count: number): $T[] {
  return Array.from({ length: count }, () => fabricator.fabricate());
}

describe("leaves", () => {
  test("a unique enum yields every member once, then throws on the next draw", () => {
    for (const salt of salts) {
      const { T, Fabricator } = initialize({ salt, clock: new Date(0) });
      const built = new Fabricator(T.unique.enum.uniform(["a", "b", "c", "d"]));

      expect(new Set(draws(built, 4))).toEqual(new Set(["a", "b", "c", "d"]));

      const error = attest.throws(FabricatorError.UniqueExhaustedError, () =>
        built.fabricate(),
      );
      expect(error.kind).toBe("enum");
      expect(error.capacity).toBe(BigInt(4));
    }
  });

  /**
   * Capacity counts distinct values: `"a"` listed twice is one value carrying
   * both weights, and the zero-weighted `"b"` is never drawable.
   */
  test("zero weights are excluded and repeated members are merged", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-merge",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique.enum.weighted([
        [1, "a"],
        [0, "b"],
        [1, "a"],
        [1, "c"],
      ]),
    );

    expect(new Set(draws(built, 2))).toEqual(new Set(["a", "c"]));
    const error = attest.throws(FabricatorError.UniqueExhaustedError, () =>
      built.fabricate(),
    );
    expect(error.capacity).toBe(BigInt(2));
  });

  test("a weighted unique enum's first draw follows the weights", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-weighted",
      clock: new Date(0),
    });
    const schema = T.unique.enum.weighted([
      [9, "a"],
      [1, "b"],
    ]);

    let firsts = 0;
    for (let i = 0; i < 2000; i++) {
      if (new Fabricator(schema).fabricate() === "a") firsts++;
    }

    expect(firsts / 2000).toBeGreaterThan(0.85);
    expect(firsts / 2000).toBeLessThan(0.95);
  });

  test("a bounded unique integer is a full permutation of its range", () => {
    for (const salt of salts) {
      const { T, Fabricator } = initialize({ salt, clock: new Date(0) });
      const built = new Fabricator(
        T.unique.number.integer.whereby({ min: 1, max: 50 }),
      );

      const drawn = draws(built, 50);
      expect([...drawn].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 50 }, (_, i) => i + 1),
      );
      expect(() => built.fabricate()).toThrow(
        FabricatorError.UniqueExhaustedError,
      );
    }
  });

  test("an unbounded unique integer never repeats", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-unbounded",
      clock: new Date(0),
    });
    const built = new Fabricator(T.unique.number.integer);

    const drawn = draws(built, 2000);
    expect(new Set(drawn).size).toBe(2000);
    expect(drawn.every(Number.isInteger)).toBe(true);
  });

  /**
   * A skewed range is tracked rather than permuted, but its size is still
   * known, so it exhausts by counting: the draw after the last value throws
   * `UniqueExhaustedError` without searching.
   */
  test("a skewed unique integer range yields each value once, then exhausts", () => {
    for (const salt of salts) {
      const { T, Fabricator } = initialize({ salt, clock: new Date(0) });
      const built = new Fabricator(
        T.unique.number.integer.whereby({
          min: 1,
          max: 20,
          distribution: { kind: "normal" },
          redraws: 100_000,
        }),
      );

      expect(new Set(draws(built, 20)).size).toBe(20);
      expect(() => built.fabricate()).toThrow(
        FabricatorError.UniqueExhaustedError,
      );
    }
  });

  test("a continuous unique number never repeats, even under a clamping distribution", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-continuous",
      clock: new Date(0),
    });

    const plain = new Fabricator(T.unique.number.whereby({ min: 0, max: 1 }));
    expect(new Set(draws(plain, 1000)).size).toBe(1000);

    /** Half of every draw lands exactly on `max`. */
    const clamped = new Fabricator(
      T.unique.number.whereby({
        min: 0,
        max: 1,
        distribution: { kind: "custom", shape: (u) => u * 2 },
      }),
    );
    const drawn = draws(clamped, 50);
    expect(new Set(drawn).size).toBe(50);
    expect(drawn.filter((value) => value === 1).length).toBeLessThanOrEqual(1);
  });

  test("a continuous range whose ends meet holds one value", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-point",
      clock: new Date(0),
    });
    const built = new Fabricator(T.unique.number.whereby({ min: 2, max: 2 }));

    expect(built.fabricate()).toBe(2);
    const error = attest.throws(FabricatorError.UniqueExhaustedError, () =>
      built.fabricate(),
    );
    expect(error.capacity).toBe(BigInt(1));
  });

  test("a unique bigint range is a full permutation", () => {
    for (const salt of salts) {
      const { T, Fabricator } = initialize({ salt, clock: new Date(0) });
      const built = new Fabricator(
        T.unique.bigint.whereby({ min: BigInt(-10), max: BigInt(9) }),
      );

      expect(new Set(draws(built, 20)).size).toBe(20);
      expect(() => built.fabricate()).toThrow(
        FabricatorError.UniqueExhaustedError,
      );
    }
  });

  test("a unique string never repeats", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-string",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique.string.whereby({ length: 3, composition: { lowercase: 1 } }),
    );

    expect(new Set(draws(built, 2000)).size).toBe(2000);
  });

  test("a unique string that can spell few values exhausts by counting", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-string-small",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique.string.whereby({ length: 1, composition: [[1, "ab"]] }),
    );

    expect(new Set(draws(built, 2))).toEqual(new Set(["a", "b"]));
    const error = attest.throws(FabricatorError.UniqueExhaustedError, () =>
      built.fabricate(),
    );
    expect(error.kind).toBe("string");
    expect(error.capacity).toBe(BigInt(2));
    expect(error.collection).toBeUndefined();
  });

  test("a unique string's redraws must be a whole number from 0 up", () => {
    const { T } = initialize({ salt: "unique-string-redraws" });
    expect(() => T.unique.string.whereby({ length: 3, redraws: -1 })).toThrow(
      FabricatorError.InvalidRedrawsError,
    );
  });

  test("a uniform unique date range yields every millisecond once, then exhausts", () => {
    for (const salt of salts) {
      const { T, Fabricator } = initialize({ salt, clock: new Date(0) });
      const built = new Fabricator(
        T.unique.date.whereby({ min: new Date(1000), max: new Date(1049) }),
      );

      const times = draws(built, 50).map((date) => date.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 50 }, (_, i) => 1000 + i),
      );
      expect(() => built.fabricate()).toThrow(
        FabricatorError.UniqueExhaustedError,
      );
    }
  });

  test("a skewed unique date range is tracked and still exhausts by counting", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-date-skew",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique.date.whereby({
        min: new Date(0),
        max: new Date(19),
        distribution: { kind: "normal" },
        redraws: 100_000,
      }),
    );

    expect(new Set(draws(built, 20).map((date) => date.getTime())).size).toBe(
      20,
    );
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });

  test("unique past and future dates stay on their side of the clock", () => {
    const clock = new Date(1_700_000_000_000);
    const { T, Fabricator } = initialize({ salt: "unique-date-mode", clock });

    const past = draws(new Fabricator(T.unique.date.past), 500);
    expect(new Set(past.map((date) => date.getTime())).size).toBe(500);
    expect(past.every((date) => date <= clock)).toBe(true);

    const soon = new Fabricator(
      T.unique.date.future.whereby({ max: new Date(clock.getTime() + 9) }),
    );
    const times = draws(soon, 10).map((date) => date.getTime());
    expect(new Set(times).size).toBe(10);
    expect(Math.min(...times)).toBe(clock.getTime());
    expect(() => soon.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });

  test("T.unique.number.integer.big is T.unique.bigint", () => {
    const { T } = initialize({ salt: "unique-big" });
    expect(T.unique.number.integer.big).toBe(T.unique.bigint);
  });

  test("the same salt and clock replay the same unique sequence", () => {
    const a = initialize({ salt: "unique-replay", clock: "derived" });
    const b = initialize({ salt: "unique-replay", clock: "derived" });

    const schemaA = a.T.unique.number.integer.whereby({ min: 1, max: 100 });
    const schemaB = b.T.unique.number.integer.whereby({ min: 1, max: 100 });

    expect(draws(new a.Fabricator(schemaA), 100)).toEqual(
      draws(new b.Fabricator(schemaB), 100),
    );
  });

  /**
   * `fabricate(schema)` continues one Fabricator per scope, so a unique leaf
   * stays distinct across calls within a `wrap` and starts over in the next.
   */
  test("fabricate(schema) is distinct within a wrap and resets across wraps", () => {
    const instance = initialize({ salt: "unique-scope", clock: new Date(0) });
    const S = instance.T.unique.enum.uniform(["a", "b", "c"]);

    for (const name of ["one", "two"]) {
      instance.wrap({ salt: layer(name) }, () => {
        const drawn = [
          instance.fabricate(S),
          instance.fabricate(S),
          instance.fabricate(S),
        ];
        expect(new Set(drawn)).toEqual(new Set(["a", "b", "c"]));
        expect(() => instance.fabricate(S)).toThrow(
          FabricatorError.UniqueExhaustedError,
        );
      });
    }
  });

  test("a per-call override is recorded, so no later draw repeats it", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-claim",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.object({ id: T.unique.number.integer.whereby({ min: 1, max: 3 }) }),
    );

    expect(built.fabricate({ id: 2 }).id).toBe(2);
    const later = [built.fabricate().id, built.fabricate().id];
    expect(new Set(later)).toEqual(new Set([1, 3]));
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });

  test("an override claims through T.omittable, and Omitted claims nothing", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-claim-omittable",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.object({
        tag: T.omittable(T.unique.enum.uniform(["a", "b"])).weighted({
          omitted: 0,
        }),
      }),
    );

    expect(built.fabricate({ tag: Omitted })).toEqual({});
    expect(built.fabricate({ tag: "a" })).toEqual({ tag: "a" });
    expect(built.fabricate()).toEqual({ tag: "b" });
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });

  /**
   * Recording, not checking: an override may repeat a drawn value, since the
   * caller asked for it, and a value outside the range uses up none of it.
   */
  test("an override may repeat a drawn value, and one outside the domain costs nothing", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-claim-loose",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.object({ id: T.unique.number.integer.whereby({ min: 1, max: 2 }) }),
    );

    const first = built.fabricate().id;
    expect(built.fabricate({ id: first }).id).toBe(first);
    expect(built.fabricate({ id: 99 }).id).toBe(99);
    expect(built.fabricate().id).toBe(first === 1 ? 2 : 1);
  });

  /**
   * Pinned, the unique field would be one combinatorial axis: two booleans
   * times two tags, with each tag scheduled twice.
   */
  test("combinatorial never pins a unique leaf", () => {
    const { T, combinatorial } = initialize({
      salt: "unique-combinatorial",
      clock: new Date(0),
    });

    const instances = [
      ...combinatorial(
        T.object({ flag: T.boolean, tag: T.unique.enum.uniform(["a", "b"]) }),
      ),
    ];

    expect(instances.map((instance) => instance.flag).sort()).toEqual([
      false,
      true,
    ]);
    expect(new Set(instances.map((instance) => instance.tag))).toEqual(
      new Set(["a", "b"]),
    );
  });

  test("a producer replaces the draw, uniqueness included", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-as",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique.enum.uniform(["a", "b"]).as(() => "a"),
    );

    expect(draws(built, 3)).toEqual(["a", "a", "a"]);
  });
});

describe("collections", () => {
  test("array members are distinct within each array and repeat across arrays", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-array",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique
        .array(T.enum.uniform(["a", "b", "c", "d", "e"]))
        .whereby({ length: 3 }),
    );

    const arrays = draws(built, 50);
    for (const array of arrays) expect(new Set(array).size).toBe(3);

    const appearances = arrays.filter((array) => array.includes("a")).length;
    expect(appearances).toBeGreaterThan(1);
  });

  test("an array as long as a finite member set is a permutation of it", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-array-permutation",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique.array(T.enum.uniform(["x", "y", "z"])).whereby({ length: 3 }),
    );

    const orders = new Set(draws(built, 200).map((array) => array.join("")));
    expect(orders).toEqual(new Set(["xyz", "xzy", "yxz", "yzx", "zxy", "zyx"]));
  });

  test("a length past a finite member set throws at construction", () => {
    const { T, Fabricator } = initialize({ salt: "unique-capacity" });
    const schema = T.unique.array(T.boolean).whereby({ length: { max: 3 } });

    const error = attest.throws(FabricatorError.UniqueCapacityError, () => {
      new Fabricator(schema);
    });
    expect(error.label).toBe("T.unique.array");
    expect(error.capacity).toBe(BigInt(2));
    expect(error.requested).toBe(3);
  });

  test("tracked members compare as plain data", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-structural",
      clock: new Date(0),
    });

    const pairs = new Fabricator(
      T.unique
        .array(T.object({ a: T.boolean, b: T.boolean }))
        .whereby({ length: 4 }),
    );
    const keys = pairs.fabricate().map(({ a, b }) => `${a}${b}`);
    expect(new Set(keys).size).toBe(4);

    const equal = new Fabricator(
      T.unique.array(T.opaque(() => ({ a: 1 }))).whereby({ length: 2 }),
    );
    expect(() => equal.fabricate()).toThrow(FabricatorError.UniqueRedrawsError);
  });

  test("objects that are not plain data compare by identity", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-identity",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique
        .array(T.opaque(() => new Map([["a", 1]])))
        .whereby({ length: 5 }),
    );

    expect(built.fabricate().length).toBe(5);
  });

  test("by makes members distinct by a projection", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-by",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique
        .array(
          T.object({
            email: T.enum.uniform(["p@x", "q@x"]),
            age: T.number.integer.whereby({ min: 1, max: 9 }),
          }),
        )
        .by((user) => user.email)
        .whereby({ length: 2 }),
    );

    for (const users of draws(built, 50)) {
      expect(new Set(users.map((user) => user.email)).size).toBe(2);
    }
  });

  test("a tracked domain that runs out throws after the redraws cap", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-redraws",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique
        .array(T.object({ a: T.boolean }))
        .whereby({ length: 3, redraws: 5 }),
    );

    const error = attest.throws(FabricatorError.UniqueRedrawsError, () =>
      built.fabricate(),
    );
    expect(error.redraws).toBe(5);
    expect(error.produced).toBe(2);
  });

  /**
   * `redraws` counts retries after the first draw, so `0` is valid: one draw,
   * and a repeat forfeits at once.
   */
  test("redraws: 0 allows one draw per value and no retries", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-redraws-zero",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique
        .array(T.object({ a: T.boolean }))
        .whereby({ length: 3, redraws: 0 }),
    );

    const error = attest.throws(FabricatorError.UniqueRedrawsError, () =>
      built.fabricate(),
    );
    expect(error.redraws).toBe(0);
  });

  test("redraws must be a whole number from 0 up", () => {
    const { T } = initialize({ salt: "unique-redraws-invalid" });

    for (const redraws of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        T.unique
          .array(T.string.whereby({ length: 3 }))
          .whereby({ length: 2, redraws }),
      ).toThrow(FabricatorError.InvalidRedrawsError);
    }
  });

  /**
   * The default cap scales with what the scope has produced, so a uniform
   * domain fills to its last value: at that point a draw fails with probability
   * about e^-20.
   */
  test("the default cap fills a tracked uniform domain to its last value", () => {
    for (const salt of salts.slice(0, 5)) {
      const { T, Fabricator } = initialize({ salt, clock: new Date(0) });
      const built = new Fabricator(
        T.unique
          .array(
            T.object({ n: T.number.integer.whereby({ min: 1, max: 300 }) }),
          )
          .whereby({ length: 300 }),
      );

      expect(new Set(built.fabricate().map(({ n }) => n)).size).toBe(300);
    }
  });

  test("a fixed redraws replaces the default cap", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-redraws-fixed",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique
        .array(T.object({ n: T.number.integer.whereby({ min: 1, max: 300 }) }))
        .whereby({ length: 300, redraws: 1 }),
    );

    expect(() => built.fabricate()).toThrow(FabricatorError.UniqueRedrawsError);
  });

  test("a unique record holds exactly the size drawn", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-record",
      clock: new Date(0),
    });

    const ranged = new Fabricator(
      T.unique
        .record(T.enum.uniform(["a", "b", "c", "d"]), T.boolean)
        .whereby({ size: { min: 2, max: 4 } }),
    );
    const sizes = new Set(
      draws(ranged, 200).map((record) => Object.keys(record).length),
    );
    expect(sizes).toEqual(new Set([2, 3, 4]));

    const exact = new Fabricator(
      T.unique
        .record(T.string.whereby({ length: 2 }), T.boolean)
        .whereby({ size: 5 }),
    );
    for (const record of draws(exact, 50)) {
      expect(Object.keys(record).length).toBe(5);
    }
  });

  test("a unique record's size past a finite key set throws at construction", () => {
    const { T, Fabricator } = initialize({ salt: "unique-record-capacity" });
    const schema = T.unique
      .record(T.always("k"), T.boolean)
      .whereby({ size: 2 });

    expect(() => new Fabricator(schema)).toThrow(
      FabricatorError.UniqueCapacityError,
    );
  });

  test("a unique record writes a drawn __proto__ key as its own property", () => {
    const { T, Fabricator } = initialize({ salt: "unique-record-proto" });
    const built = new Fabricator(
      T.unique.record(T.always("__proto__"), T.always(1)).whereby({ size: 1 }),
    );

    const record = built.fabricate();
    expect(Object.getOwnPropertyNames(record)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
  });

  test("date and string members are drawn distinct within each array", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-array-date",
      clock: new Date(0),
    });

    const instants = new Fabricator(
      T.unique
        .array(T.date.whereby({ min: new Date(0), max: new Date(4) }))
        .whereby({ length: 5 }),
    );
    expect(new Set(instants.fabricate().map((date) => date.getTime()))).toEqual(
      new Set([0, 1, 2, 3, 4]),
    );
    expect(
      () =>
        new Fabricator(
          T.unique
            .array(T.date.whereby({ min: new Date(0), max: new Date(4) }))
            .whereby({ length: 6 }),
        ),
    ).toThrow(FabricatorError.UniqueCapacityError);

    const words = new Fabricator(
      T.unique
        .array(T.string.whereby({ length: 2, composition: { lowercase: 1 } }))
        .whereby({ length: 100 }),
    );
    expect(new Set(words.fabricate()).size).toBe(100);
  });

  test("a unique leaf as a member stays distinct across collections", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-nested",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.unique
        .array(T.unique.number.integer.whereby({ min: 1, max: 6 }))
        .whereby({ length: 3 }),
    );

    expect(new Set([...built.fabricate(), ...built.fabricate()]).size).toBe(6);
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });
});

describe("collection hints", () => {
  test("a unique leaf that runs out as a T.array element names T.unique.array", () => {
    const { T, Fabricator } = initialize({ salt: "unique-hint-array" });
    const built = new Fabricator(
      T.array(T.unique.enum.uniform(["a", "b"])).whereby({ length: 3 }),
    );

    const error = attest.throws(FabricatorError.UniqueExhaustedError, () =>
      built.fabricate(),
    );
    expect(error.collection).toBe("array");
    expect(error.message).toContain("T.unique.array");
  });

  test("a unique leaf that runs out as a T.record key names T.unique.record", () => {
    const { T, Fabricator } = initialize({ salt: "unique-hint-record" });
    const built = new Fabricator(
      T.record(
        T.unique.string.whereby({ length: 1, composition: [[1, "a"]] }),
        T.boolean,
      ).whereby({ size: { max: 2, minTried: 2 } }),
    );

    const error = attest.throws(FabricatorError.UniqueExhaustedError, () =>
      built.fabricate(),
    );
    expect(error.collection).toBe("record");
    expect(error.message).toContain("T.unique.record");
  });

  test("a unique leaf outside a collection gets no hint", () => {
    const { T, Fabricator } = initialize({ salt: "unique-hint-none" });
    const built = new Fabricator(T.unique.enum.uniform(["a"]));
    built.fabricate();

    const error = attest.throws(FabricatorError.UniqueExhaustedError, () =>
      built.fabricate(),
    );
    expect(error.collection).toBeUndefined();
    expect(error.message).not.toContain("T.unique.array");
  });
});

describe("enumeration", () => {
  /**
   * `coverage` makes as many instances as its widest axis. A unique leaf is
   * never an axis, so with fewer values than instances it starts a fresh round
   * instead of failing the schedule partway.
   */
  test("coverage cycles a unique leaf with fewer values than instances", () => {
    const { T, coverage } = initialize({
      salt: "unique-coverage-cycle",
      clock: new Date(0),
    });

    const instances = [
      ...coverage(
        T.object({
          size: T.enum.uniform(["xs", "s", "m", "l", "xl"]),
          tag: T.unique.enum.uniform(["a", "b"]),
        }),
      ),
    ];
    const tags = instances.map((instance) => instance.tag);

    expect(instances.length).toBe(5);
    expect(new Set(tags.slice(0, 2))).toEqual(new Set(["a", "b"]));
    expect(new Set(tags.slice(2, 4))).toEqual(new Set(["a", "b"]));
    expect(new Set(tags)).toEqual(new Set(["a", "b"]));
  });

  test("combinatorial uses every value before starting a new round", () => {
    const { T, combinatorial } = initialize({
      salt: "unique-combinatorial-cycle",
      clock: new Date(0),
    });

    const ids = [
      ...combinatorial(
        T.object({
          flag: T.boolean,
          size: T.enum.uniform(["s", "m", "l"]),
          id: T.unique.number.integer.whereby({ min: 1, max: 4 }),
        }),
      ),
    ].map((instance) => instance.id);

    expect(ids.length).toBe(6);
    expect(new Set(ids.slice(0, 4))).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(ids.slice(4)).size).toBe(2);
  });

  test("a tracked leaf that hits its cap also starts a new round", () => {
    const { T, coverage } = initialize({
      salt: "unique-coverage-tracked",
      clock: new Date(0),
    });

    const names = [
      ...coverage(
        T.object({
          size: T.enum.uniform(["xs", "s", "m", "l", "xl"]),
          name: T.unique.string.whereby({
            length: 1,
            composition: [[1, "ab"]],
          }),
        }),
      ),
    ].map((instance) => instance.name);

    expect(names.length).toBe(5);
    expect(new Set(names.slice(0, 2))).toEqual(new Set(["a", "b"]));
  });

  test("the same schema still throws when built outside an enumeration", () => {
    const { T, Fabricator } = initialize({ salt: "unique-coverage-outside" });
    const built = new Fabricator(
      T.object({
        size: T.enum.uniform(["xs", "s", "m"]),
        tag: T.unique.enum.uniform(["a", "b"]),
      }),
    );

    built.fabricate();
    built.fabricate();
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });

  test("a unique collection never repeats a member within one value, even in an enumeration", () => {
    const { T, coverage } = initialize({
      salt: "unique-coverage-collection",
      clock: new Date(0),
    });

    for (const instance of coverage(
      T.object({
        size: T.enum.uniform(["xs", "s", "m", "l", "xl"]),
        tags: T.unique
          .array(T.enum.uniform(["a", "b", "c"]))
          .whereby({ length: 3 }),
      }),
    )) {
      expect(new Set(instance.tags).size).toBe(3);
    }
  });
});

describe("members that cycle", () => {
  /**
   * In an enumeration a unique leaf cycles once it runs out, so as a unique
   * array's member it can repeat. The array still tracks what it holds: it
   * starts each array on a fresh round, and a length past the leaf's values
   * fails rather than repeating a member.
   */
  test("a unique array never repeats a cycling unique leaf within one value", () => {
    const { T, coverage } = initialize({
      salt: "unique-member-cycle",
      clock: new Date(0),
    });

    const fits = T.object({
      size: T.enum.uniform(["s", "m", "l"]),
      tags: T.unique
        .array(T.unique.enum.uniform(["a", "b"]))
        .whereby({ length: 2 }),
    });
    for (const instance of coverage(fits)) {
      expect(new Set(instance.tags)).toEqual(new Set(["a", "b"]));
    }

    const overflows = T.object({
      size: T.enum.uniform(["s", "m", "l"]),
      tags: T.unique
        .array(T.unique.enum.uniform(["a", "b"]))
        .whereby({ length: 3 }),
    });
    expect(() => [...coverage(overflows)]).toThrow(
      FabricatorError.UniqueRedrawsError,
    );
  });

  test("an override on an optional unique field is recorded through the wrapper", () => {
    const { T, Fabricator } = initialize({
      salt: "unique-override-optional",
      clock: new Date(0),
    });
    const built = new Fabricator(
      T.object({
        id: T.optional(
          T.unique.number.integer.whereby({ min: 1, max: 2 }),
        ).weighted({ omitted: 0, undefined: 0 }),
      }),
    );

    expect(built.fabricate({ id: undefined })).toEqual({ id: undefined });
    expect(built.fabricate({ id: 1 })).toEqual({ id: 1 });
    expect(built.fabricate()).toEqual({ id: 2 });
    expect(() => built.fabricate()).toThrow(
      FabricatorError.UniqueExhaustedError,
    );
  });
});
