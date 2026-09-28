import { describe, expect, test } from "bun:test";
import { classes } from "@ghostry/fabricator";
import {
  census,
  CensusError,
  report,
  suggest,
  type CensusOptions,
  type Suggestion,
} from "@ghostry/fabricator-census";

function suggested(values: unknown[], options?: CensusOptions): Suggestion {
  return suggest(census.from(values, { seed: "suggest", ...options }));
}

/** The suggestion for one field of a top-level object suggestion. */
function field(suggestion: Suggestion, key: string): Suggestion {
  if (suggestion.kind !== "object")
    throw new Error(`not an object: ${suggestion.kind}`);
  const entry = suggestion.fields.find((f) => f.key === key);
  if (entry === undefined) throw new Error(`no field ${key}`);
  return entry.value;
}

/** Repeat each row `times` times, so presence rules have counts to work with. */
const repeat = <$T>(rows: $T[], times: number): $T[] =>
  Array.from({ length: times }, () => rows).flat();

describe("presence", () => {
  test.each([
    ["absent only", [{ a: 1 }, {}], "omittable", { omitted: 1, value: 1 }],
    [
      "absent and present-undefined",
      [{ a: 1 }, {}, { a: undefined }],
      "optional",
      { omitted: 1, undefined: 1, value: 1 },
    ],
    [
      "present-undefined only",
      [{ a: 1 }, { a: undefined }],
      "undefinable",
      { undefined: 1, value: 1 },
    ],
    ["null only", [{ a: 1 }, { a: null }], "nullable", { null: 1, value: 1 }],
    [
      "null and undefined",
      [{ a: 1 }, { a: null }, { a: undefined }],
      "nullish",
      { null: 1, undefined: 1, value: 1 },
    ],
  ] as const)("%s → %s", (_, rows, kind, weights) => {
    const a = field(suggested(repeat([...rows], 10)), "a");
    expect(a.kind).toBe(kind);
    const actual: unknown = "weights" in a ? a.weights : null;
    expect(actual).toEqual(
      Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v * 10])),
    );
  });

  test("absent and null nest a nullable under an omittable, counted over present values", () => {
    const a = field(
      suggested(repeat([{ a: 1 }, { a: 2 }, { a: null }, {}], 10)),
      "a",
    );
    expect(a).toMatchObject({
      kind: "omittable",
      weights: { omitted: 10, value: 30 },
      inner: { kind: "nullable", weights: { null: 10, value: 20 } },
    });
  });

  test("absent, null and undefined nest a nullish under an omittable", () => {
    const a = field(
      suggested(repeat([{ a: 1 }, { a: null }, { a: undefined }, {}], 10)),
      "a",
    );
    expect(a).toMatchObject({
      kind: "omittable",
      weights: { omitted: 10, value: 30 },
      inner: {
        kind: "nullish",
        weights: { null: 10, undefined: 10, value: 10 },
      },
    });
  });

  test("a field only ever null is T.null, wrapped if sometimes absent", () => {
    const a = field(suggested(repeat([{ a: null }, {}], 5)), "a");
    expect(a).toMatchObject({ kind: "omittable", inner: { kind: "null" } });
  });

  test("top-level values and elements are never omittable", () => {
    expect(suggested(repeat([1, 2, null], 10)).kind).toBe("nullable");
  });
});

describe("types", () => {
  test("mixed types become a weighted choice, most frequent first", () => {
    const suggestion = suggested(repeat([1, 2, "x"], 10));
    expect(suggestion.kind).toBe("choice");
    if (suggestion.kind !== "choice") return;
    expect(suggestion.options.map(([w, s]) => [w, s.kind])).toEqual([
      [20, "number"],
      [10, "always"],
    ]);
  });

  test("a value seen alone is T.always", () => {
    expect(suggested(["only", "only"])).toMatchObject({
      kind: "always",
      value: "only",
    });
    expect(suggested([true, true])).toMatchObject({
      kind: "always",
      value: true,
    });
  });

  test("booleans carry their weights", () => {
    expect(suggested(repeat([true, true, false], 3))).toMatchObject({
      kind: "boolean",
      weights: { true: 6, false: 3 },
    });
  });

  test("objects past the depth limit are opaque, with a note", () => {
    const suggestion = suggested([{ a: { b: 1 } }], { depth: 1 });
    const a = field(suggestion, "a");
    expect(a.kind).toBe("opaque");
    expect(a.notes.join(" ")).toContain("depth limit");
  });

  test("values census does not walk are opaque", () => {
    expect(suggested([new Map()]).kind).toBe("opaque");
  });
});

describe("numbers", () => {
  test("1, 2, 3, … in order is a sequence", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
    expect(field(suggested(rows), "id").kind).toBe("sequence");
  });

  test("NaN and infinities become T.always arms, with a note", () => {
    const suggestion = suggested([
      ...repeat([1.5, 2.5, 7.25], 5),
      NaN,
      Infinity,
    ]);
    expect(suggestion.kind).toBe("choice");
    if (suggestion.kind !== "choice") return;
    expect(suggestion.options.slice(1).map(([, s]) => s)).toEqual([
      { kind: "always", value: { type: "number", value: "NaN" }, notes: [] },
      {
        kind: "always",
        value: { type: "number", value: "Infinity" },
        notes: [],
      },
    ]);
    expect(suggestion.notes.join(" ")).toContain("NaN");
  });

  test("all-distinct numbers note that core has no uniqueness", () => {
    const suggestion = suggested(
      Array.from({ length: 40 }, (_, i) => (i * 37) % 101),
    );
    expect(suggestion.kind).toBe("number");
    expect(suggestion.notes.join(" ")).toContain("uniqueness");
  });

  test("repeated non-integer values are an enum", () => {
    expect(suggested(repeat([0.5, 1.5, 2.5], 10)).kind).toBe("enum");
  });

  test("integers an ordinary range already fits stay a range", () => {
    const values = Array.from({ length: 2000 }, (_, i) => i % 50);
    expect(suggested(values).kind).toBe("number");
  });

  test("integers no range fits are an enum", () => {
    expect(suggested(repeat([1, 50, 100], 20)).kind).toBe("enum");
  });
});

describe("enums", () => {
  test("repeated strings are a weighted enum, most frequent first", () => {
    expect(suggested(repeat(["a", "a", "b"], 10))).toMatchObject({
      kind: "enum",
      items: [
        [20, "a"],
        [10, "b"],
      ],
    });
  });

  test("ten rows of ten distinct values are not an enum", () => {
    const names = [
      "ann",
      "bob",
      "cy",
      "dee",
      "ed",
      "flo",
      "gus",
      "hal",
      "ivy",
      "jo",
    ];
    expect(suggested(names).kind).toBe("string");
  });

  test("too many singletons is not an enum", () => {
    const values = [...repeat(["a", "b"], 30), "c", "d", "e", "f"];
    expect(suggested(values, {}).kind).toBe("string");
    expect(suggest(census.from(values), { enumSingletons: 0.1 }).kind).toBe(
      "enum",
    );
  });

  test("bigint and Date members stay tagged", () => {
    const suggestion = suggested(repeat([BigInt(1), BigInt(2)], 10));
    expect(suggestion).toMatchObject({
      kind: "enum",
      items: [
        [10, { type: "bigint", value: "1" }],
        [10, { type: "bigint", value: "2" }],
      ],
    });
  });
});

describe("strings", () => {
  const words = Array.from(
    { length: 300 },
    (_, i) => "abcdefghij".slice(0, (i % 7) + 1) + String(i),
  );

  test("length is a fitted range, composition the record form over core's classes", () => {
    const suggestion = suggested(words);
    expect(suggestion.kind).toBe("string");
    if (suggestion.kind !== "string") return;
    expect(typeof suggestion.whereby.length).toBe("object");
    expect(suggestion.whereby.composition).toEqual({
      lowercase: expect.any(Number),
      digit: expect.any(Number),
    });
  });

  test("an equal length for every value is a bare count", () => {
    const suggestion = suggested(
      Array.from({ length: 50 }, (_, i) => `k${1000 + i}`),
    );
    if (suggestion.kind !== "string") throw new Error(suggestion.kind);
    expect(suggestion.whereby.length).toBe(5);
  });

  test("code points outside core's classes switch composition to the pair form", () => {
    const suggestion = suggested(
      Array.from({ length: 50 }, (_, i) => `café${i}`),
    );
    if (suggestion.kind !== "string") throw new Error(suggestion.kind);
    expect(suggestion.whereby.composition).toEqual([
      [expect.any(Number), classes.lowercase],
      [expect.any(Number), classes.digit],
      [50, { from: 0xe9, to: 0xe9 }],
    ]);
  });

  test("ISO date-times derive from a fitted date", () => {
    const start = Date.parse("2024-01-01T00:00:00Z");
    const values = Array.from({ length: 200 }, (_, i) =>
      new Date(start + i * 3_600_000).toISOString(),
    );
    const suggestion = suggested(values);
    expect(suggestion).toMatchObject({
      kind: "derive",
      resolve: "isoDateTime",
      from: { kind: "date", whereby: { min: values[0], max: values[199] } },
    });
    expect(suggestion.notes).toEqual([]);
  });

  test("date-times without an offset note that they were read as local time", () => {
    const values = Array.from(
      { length: 20 },
      (_, i) => `2024-01-${String(i + 1).padStart(2, "0")} 10:00`,
    );
    const suggestion = suggested(values);
    expect(suggestion.kind).toBe("derive");
    expect(suggestion.notes.join(" ")).toContain("local time");
  });

  test("ISO dates resolve to the date part only", () => {
    const values = Array.from(
      { length: 20 },
      (_, i) => `2024-02-${String(i + 1).padStart(2, "0")}`,
    );
    expect(suggested(values)).toMatchObject({
      kind: "derive",
      resolve: "isoDate",
    });
  });

  test("a recognized format names its builder", () => {
    const values = Array.from(
      { length: 20 },
      (_, i) => `${String(i).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
    );
    const suggestion = suggested(values);
    expect(suggestion).toMatchObject({ kind: "string", format: "uuid" });
    expect(suggestion.notes.join(" ")).toContain("T.faker.string.uuid()");
  });
});

describe("composites", () => {
  test("an array suggests its length and its element", () => {
    const suggestion = suggested(
      Array.from({ length: 100 }, (_, i) =>
        Array.from({ length: i % 4 }, () => i % 3 === 0),
      ),
    );
    expect(suggestion).toMatchObject({
      kind: "array",
      whereby: { length: { min: 0, max: 3 } },
      element: { kind: "boolean" },
    });
  });

  test("an array always empty has an opaque element", () => {
    expect(suggested([[], []])).toMatchObject({
      kind: "array",
      whereby: { length: 0 },
      element: { kind: "opaque" },
    });
  });

  test("record mode becomes a T.record", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ [`user-${i}`]: i }));
    const suggestion = suggested(rows, { fields: 8 });
    expect(suggestion).toMatchObject({
      kind: "record",
      key: { kind: "string" },
      value: { kind: "number" },
      whereby: { size: { max: 1, minTried: 1 } },
    });
  });

  test("many same-typed fields are flagged as a likely record", () => {
    const row = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${i}`, i]),
    );
    const suggestion = suggest(census.from([row, row]), { recordKeys: 32 });
    expect(suggestion.kind).toBe("object");
    expect(suggestion.notes.join(" ")).toContain("T.record");
  });

  test("a field whose values split other fields' presence is flagged as a discriminant", () => {
    const rows = [
      ...repeat([{ kind: "card", last4: "4242", brand: "visa" }], 30),
      ...repeat([{ kind: "bank", iban: "DE89", bic: "COBADEFF" }], 20),
    ];
    const suggestion = suggested(rows);
    expect(suggestion.notes.join(" ")).toContain("`kind` may discriminate");
  });
});

describe("options", () => {
  test("invalid options are rejected", () => {
    expect(() => suggest(census.from([1]), { enumSupport: -1 })).toThrow(
      CensusError.InvalidOptionError,
    );
  });

  test("a suggestion is plain data", () => {
    const suggestion = suggested([
      { a: 1.5, b: "x", c: [true] },
      { a: 2.5, b: "y", c: [] },
    ]);
    expect(JSON.parse(JSON.stringify(suggestion))).toStrictEqual(suggestion);
  });
});

describe("report", () => {
  const rows = repeat(
    [
      { id: 1, status: "active", note: "hi" },
      { id: 2, status: "active" },
      { id: 3, status: "banned", note: null },
    ],
    10,
  );

  test("lists one line per path, as the builder call it suggests", () => {
    const text = report(census.from(rows, { seed: "report" }));
    expect(text).toContain("$  T.object(");
    expect(text).toContain(
      '$.status  T.enum.weighted([[20, "active"], [10, "banned"]])',
    );
    expect(text).toContain("$.note  T.omittable(T.nullable(");
    expect(text).toContain("Not detected:");
  });

  test("shows every fit candidate's score", () => {
    const values = Array.from({ length: 500 }, (_, i) => (i * 7.3) % 100);
    expect(report(census.from(values))).toMatch(/fit: .*uniform \d\.\d{4}/);
  });
});
