import { describe, expect, test } from "bun:test";
import { FabricatorError } from "@ghostry/fabricator";
import {
  census,
  CensusError,
  type Census,
  type Node,
} from "@ghostry/fabricator-census";

/** A field's entry off an object node, failing loudly when it is missing. */
function field(node: Node, key: string) {
  const entry = node.object?.fields?.find((f) => f.key === key);
  if (entry === undefined) throw new Error(`no field ${key}`);
  return entry;
}

describe("presence", () => {
  test("an absent key and a key present as undefined are counted apart", () => {
    const { root } = census.from([
      { a: 1, b: 2 },
      { a: undefined, b: 3 },
      { b: 4 },
      {},
    ]);

    const a = field(root, "a");
    expect(a.present).toBe(2);
    expect(a.absent).toBe(2);
    expect(a.node.types.undefined).toBe(1);
    expect(a.node.types.number).toBe(1);

    const b = field(root, "b");
    expect(b.present).toBe(3);
    expect(b.absent).toBe(1);
  });

  test("an array hole counts as undefined", () => {
    const sparse: unknown[] = [1];
    sparse[2] = 3;
    const { root } = census.from([sparse]);
    const element = root.array!.element;
    expect(element.count).toBe(3);
    expect(element.types.undefined).toBe(1);
    expect(element.types.number).toBe(2);
  });

  test("a key named __proto__ is an ordinary field", () => {
    const value = JSON.parse('{"__proto__": 1, "x": 2}') as object;
    const { root } = census.from([value]);
    expect(field(root, "__proto__").present).toBe(1);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("types", () => {
  test("each value lands in exactly one type count", () => {
    class Point {}
    const { root } = census.from([
      1,
      "s",
      true,
      BigInt(2),
      new Date(0),
      null,
      undefined,
      [],
      {},
      new Map(),
      new Point(),
      Symbol("x"),
      () => {},
    ]);
    expect(root.count).toBe(13);
    expect(root.types).toEqual({
      number: 1,
      string: 1,
      boolean: 1,
      bigint: 1,
      date: 1,
      null: 1,
      undefined: 1,
      array: 1,
      object: 1,
      other: 4,
    });
    expect(root.number).not.toBeNull();
    expect(root.boolean).toEqual({ true: 1, false: 0 });
  });

  test("NaN and infinities stay out of the summary; -0 enters it as 0", () => {
    const { root } = census.from([1, NaN, Infinity, -Infinity, -0, 3]);
    const numbers = root.number!;
    expect(numbers.count).toBe(6);
    expect(numbers.finite).toBe(3);
    expect(numbers.nan).toBe(1);
    expect(numbers.positiveInfinity).toBe(1);
    expect(numbers.negativeInfinity).toBe(1);
    expect(numbers.negativeZero).toBe(1);
    expect(numbers.summary!.min).toBe(0);
    expect(numbers.summary!.max).toBe(3);
    expect(numbers.summary!.mean).toBeCloseTo(4 / 3, 12);
  });

  test("an invalid Date is counted but kept out of the epoch tally", () => {
    const { root } = census.from([new Date(NaN), new Date(1000)]);
    expect(root.date!.count).toBe(2);
    expect(root.date!.invalid).toBe(1);
    expect(root.date!.epoch.finite).toBe(1);
  });

  test("bigint extremes compare exactly past 2^53", () => {
    const big = BigInt("9007199254740993");
    const { root } = census.from([big, big - BigInt(1), BigInt(-5)]);
    expect(root.bigint!.min).toBe("-5");
    expect(root.bigint!.max).toBe("9007199254740993");
  });
});

describe("numeric summary", () => {
  const values = [2, 4, 4, 4, 5, 5, 7, 9, 30];

  test("moments match a direct computation", () => {
    const summary = census.from(values).root.number!.summary!;
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const m2 = values.reduce((a, b) => a + (b - mean) ** 2, 0);
    const m3 = values.reduce((a, b) => a + (b - mean) ** 3, 0);
    expect(summary.mean).toBeCloseTo(mean, 12);
    expect(summary.stddev).toBeCloseTo(Math.sqrt(m2 / (n - 1)), 12);
    expect(summary.skewness).toBeCloseTo((Math.sqrt(n) * m3) / m2 ** 1.5, 12);
  });

  test("quantiles interpolate between order statistics", () => {
    const summary = census.from(values).root.number!.summary!;
    expect(summary.quantiles.p50).toBe(5);
    expect(summary.quantiles.p25).toBe(4);
    expect(summary.sample.exact).toBe(true);
    expect(summary.sample.points).toEqual([...values].sort((a, b) => a - b));
  });

  test("integer data bins over [min, max + 1), one bin per integer at most", () => {
    const summary = census.from([0, 1, 1, 2, 2, 2]).root.number!.summary!;
    expect(summary.histogram).toEqual({ min: 0, max: 3, counts: [1, 2, 3] });
  });

  test("continuous data bins over [min, max], the last bin closed", () => {
    const summary = census.from([0, 0.5, 1], { bins: 2 }).root.number!.summary!;
    expect(summary.histogram).toEqual({ min: 0, max: 1, counts: [1, 2] });
  });

  test("values across ±Number.MAX_VALUE bin without overflowing", () => {
    const summary = census.from([-Number.MAX_VALUE, 0, Number.MAX_VALUE], {
      bins: 2,
    }).root.number!.summary!;
    expect(summary.histogram.counts).toEqual([1, 2]);
  });

  test("consecutive holds only for exactly 1, 2, 3, … in order", () => {
    expect(census.from([1, 2, 3, 4]).root.number!.consecutive).toBe(true);
    expect(census.from([2, 3, 4]).root.number!.consecutive).toBe(false);
    expect(census.from([1, 3, 2]).root.number!.consecutive).toBe(false);
    expect(census.from([1, 2, NaN]).root.number!.consecutive).toBe(false);
  });

  test("points downsample the sorted sample, endpoints included", () => {
    const range = Array.from({ length: 101 }, (_, i) => i);
    const { sample } = census.from(range, { points: 11 }).root.number!.summary!;
    expect(sample.points).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
});

describe("strings", () => {
  test("length is in UTF-16 code units", () => {
    const { root } = census.from(["ab", "😀", "a😀"]);
    const length = root.string!.length.summary!;
    expect(length.min).toBe(2);
    expect(length.max).toBe(3);
    expect(root.string!.composition.counts.astral).toBe(2);
  });

  test("composition buckets match core's classes, with ranges outside them", () => {
    const { composition } = census.from(["aZ3!", " \t", "éÿ", "中", "\ud800"])
      .root.string!;
    expect(composition.counts).toEqual({
      lowercase: 1,
      uppercase: 1,
      digit: 1,
      symbol: 1,
      space: 1,
      control: 1,
      latin1: 2,
      bmp: 1,
      astral: 0,
      surrogate: 1,
    });
    expect(composition.ranges.latin1).toEqual({ from: 0xe9, to: 0xff });
    expect(composition.ranges.control).toEqual({ from: 0x09, to: 0x09 });
    expect(composition.ranges.astral).toBeNull();
  });

  test("formats are recognized, and ISO strings feed an epoch tally", () => {
    const { string } = census.from([
      "2024-01-02",
      "2024-01-02T03:04:05.678Z",
      "123e4567-e89b-12d3-a456-426614174000",
      "a@b.co",
      "https://example.com/x",
      "-12.5",
      "plain",
    ]).root;
    expect(string!.formats).toEqual({
      date: 1,
      dateTime: 1,
      offsetless: 0,
      uuid: 1,
      email: 1,
      url: 1,
      numeric: 1,
    });
    expect(string!.epoch!.finite).toBe(2);
    expect(string!.epoch!.summary!.max).toBe(
      Date.parse("2024-01-02T03:04:05.678Z"),
    );
  });
});

describe("frequencies", () => {
  test("every distinct value is counted, most frequent first", () => {
    const { frequencies } = census.from(["b", "a", "b", "c", "b", "a"]).root
      .string!;
    expect(frequencies).toEqual({
      distinct: 3,
      saturated: false,
      singletons: 1,
      top: [
        { value: "b", count: 3 },
        { value: "a", count: 2 },
        { value: "c", count: 1 },
      ],
    });
  });

  test("past the distinct cap the map is dropped, leaving a lower bound", () => {
    const values = Array.from({ length: 20 }, (_, i) => `v${i}`);
    const { frequencies } = census.from(values, { distinct: 5 }).root.string!;
    expect(frequencies).toEqual({
      distinct: 6,
      saturated: true,
      singletons: null,
      top: null,
    });
  });
});

describe("memory bounds", () => {
  const keyed = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ [`id-${i}`]: i % 100 }));

  test("past the fields cap an object node switches to record mode", () => {
    const { root } = census.from(keyed(10), { fields: 4 });
    const object = root.object!;
    expect(object.record).toBe(true);
    expect(object.fields).toBeNull();

    /** The four values seen before the switch are merged, not dropped. */
    expect(object.value!.count).toBe(10);
    expect(object.value!.number!.summary!.min).toBe(0);
    expect(object.value!.number!.summary!.max).toBe(9);
    expect(object.keys.count).toBe(10);
  });

  test("a census of unique-keyed objects stays the same size as input grows", () => {
    const small = JSON.stringify(census.from(keyed(10_000), { seed: "m" }));
    const large = JSON.stringify(census.from(keyed(100_000), { seed: "m" }));
    expect(large.length).toBeLessThan(small.length * 1.05);
  });

  test("past the depth limit arrays and objects are counted, not descended", () => {
    type Tree = { child?: Tree };
    const deep: Tree = {};
    let cursor = deep;
    for (let i = 0; i < 10; i++) cursor = cursor.child = {};

    let node = census.from([deep], { depth: 3 }).root;
    for (let level = 0; level < 3; level++) node = field(node, "child").node;
    expect(node.types.object).toBe(1);
    expect(node.truncated).toBe(1);
    expect(node.object).toBeNull();
  });
});

describe("serialization", () => {
  test("a census with bigint and Date values survives a JSON round trip", () => {
    const result = census.from(
      [
        { id: BigInt(5), at: new Date(0) },
        { id: BigInt(5), at: new Date(0) },
      ],
      { seed: "json" },
    );
    const parsed = JSON.parse(JSON.stringify(result)) as Census;
    expect(parsed).toStrictEqual(result);
    expect(field(parsed.root, "id").node.bigint!.frequencies.top).toEqual([
      { value: { type: "bigint", value: "5" }, count: 2 },
    ]);
    expect(field(parsed.root, "at").node.date!.epoch.frequencies.top).toEqual([
      { value: { type: "date", value: "1970-01-01T00:00:00.000Z" }, count: 2 },
    ]);
  });
});

describe("reservoir", () => {
  const values = Array.from({ length: 5000 }, (_, i) => (i * 7919) % 5000);

  test("a seed makes a sampled summary reproducible", () => {
    const a = census.from(values, { reservoir: 100, seed: "s" });
    const b = census.from(values, { reservoir: 100, seed: "s" });
    expect(a).toStrictEqual(b);
    expect(a.root.number!.summary!.sample).toMatchObject({
      size: 100,
      exact: false,
    });
  });

  test("different seeds draw different samples", () => {
    const a = census.from(values, { reservoir: 100, seed: "s" });
    const b = census.from(values, { reservoir: 100, seed: "t" });
    expect(a.root.number!.summary!.sample.points).not.toEqual(
      b.root.number!.summary!.sample.points,
    );
  });

  test("a field's sample does not depend on its siblings", () => {
    const rows = values.map((v) => ({ v }));
    const wider = values.map((v, i) => ({ extra: i, v }));
    const a = field(census.from(rows, { reservoir: 50, seed: "k" }).root, "v");
    const b = field(census.from(wider, { reservoir: 50, seed: "k" }).root, "v");
    expect(a.node).toStrictEqual(b.node);
  });

  test("a sampled summary still spans the population", () => {
    const summary = census.from(values, { reservoir: 1000, seed: "u" }).root
      .number!.summary!;
    expect(summary.min).toBe(0);
    expect(summary.max).toBe(4999);
    expect(summary.quantiles.p50).toBeGreaterThan(2000);
    expect(summary.quantiles.p50).toBeLessThan(3000);
  });

  test("record mode merges sampled reservoirs into a uniform sample", () => {
    const rows = Array.from({ length: 4000 }, (_, i) => ({ [`k${i % 8}`]: i }));
    const extra = Array.from({ length: 4000 }, (_, i) => ({
      [`z${i}`]: i + 4000,
    }));
    const { value } = census.from([...rows, ...extra], {
      fields: 8,
      reservoir: 500,
      seed: "r",
    }).root.object!;
    const { summary } = value!.number!;
    expect(value!.count).toBe(8000);
    expect(summary!.sample.size).toBe(500);
    expect(summary!.quantiles.p50).toBeGreaterThan(3200);
    expect(summary!.quantiles.p50).toBeLessThan(4800);
  });
});

describe("accumulator", () => {
  test("a census added in batches equals one taken in a single pass", () => {
    const values = Array.from({ length: 3000 }, (_, i) => ({
      n: (i * 31) % 997,
      s: `x${i % 13}`,
    }));
    const accumulator = census.begin({ reservoir: 200, seed: "b" });
    for (let i = 0; i < values.length; i += 250)
      for (const value of values.slice(i, i + 250)) accumulator.add(value);
    expect(accumulator.finish()).toStrictEqual(
      census.from(values, { reservoir: 200, seed: "b" }),
    );
  });

  test("an async source reduces to add", async () => {
    async function* rows() {
      for (let i = 1; i <= 5; i++) yield i;
    }
    const accumulator = census.begin();
    for await (const row of rows()) accumulator.add(row);
    expect(accumulator.finish().root.number!.consecutive).toBe(true);
  });

  test("add after finish throws; finish returns the same snapshot", () => {
    const accumulator = census.begin();
    accumulator.add(1);
    const first = accumulator.finish();
    expect(() => accumulator.add(2)).toThrow(CensusError.FinishedError);
    expect(() => accumulator.add(2)).toThrow(FabricatorError);
    expect(accumulator.finish()).toBe(first);
  });
});

describe("options", () => {
  test("resolved options are recorded on the census", () => {
    expect(census.from([], { bins: 5 }).options).toEqual({
      reservoir: 10_000,
      distinct: 256,
      fields: 256,
      depth: 16,
      bins: 5,
      points: 1001,
      seed: null,
    });
  });

  test.each([
    ["reservoir", 0],
    ["bins", 1.5],
    ["points", 1],
    ["depth", -1],
  ] as const)("%s = %p is rejected", (option, value) => {
    expect(() => census.begin({ [option]: value })).toThrow(
      CensusError.InvalidOptionError,
    );
  });
});
