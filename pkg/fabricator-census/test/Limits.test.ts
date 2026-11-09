import { initialize } from "@ghostry/fabricator";
import {
  census,
  CensusError,
  report,
  suggest,
  type ColumnLimits,
  type Limits,
  type Suggestion,
} from "@ghostry/fabricator-census";
import { describe, expect, test } from ".";

/** One column's suggestion, from rows `{ [column]: value }` and its limits. */
function column(values: unknown[], limits: Limits, name = "c"): Suggestion {
  const root = suggest(
    census.from(
      values.map((value) => ({ [name]: value })),
      { seed: "limits", limits: [{ column: name, limits }] },
    ),
  );
  if (root.kind !== "object") throw new Error(root.kind);
  return root.fields.find((f) => f.key === name)!.value;
}

/** Distinct values in a scrambled order, so none reads as an enum or a run. */
function spread<$T>(count: number, f: (i: number) => $T): $T[] {
  return Array.from({ length: count }, (_, i) => f((i * 7) % count));
}

const INT2: Limits = { min: -32768, max: 32767 };

describe("the limits option", () => {
  test("limits are recorded on the census and survive JSON", () => {
    const limits: ColumnLimits[] = [
      {
        column: "id",
        limits: {
          min: { type: "bigint", value: "-9223372036854775808" },
          max: { type: "bigint", value: "9223372036854775807" },
        },
      },
      { column: "name", limits: { length: { max: 40 }, notes: ["n"] } },
    ];
    const result = census.from([{ id: 1, name: "a" }], { limits });
    expect(result.limits).toEqual(limits);
    expect(result.limits).not.toBe(limits);
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });

  test("a census without limits records none", () => {
    expect(census.from([1]).limits).toEqual([]);
  });

  test("limits that are not an array are rejected", () => {
    expect(() =>
      census.begin({ limits: { column: "c" } as unknown as ColumnLimits[] }),
    ).toThrow(CensusError.InvalidOptionError);
  });

  test.each([
    ["no column name", { limits: {} }],
    ["no limits object", { column: "c" }],
    ["a non-finite end", { column: "c", limits: { max: Infinity } }],
    ["a text end", { column: "c", limits: { min: "1" } }],
    [
      "a bigint tag that is not whole",
      { column: "c", limits: { max: { type: "bigint", value: "1.5" } } },
    ],
    ["min above max", { column: "c", limits: { min: 2, max: 1 } }],
    [
      "a bigint min above a number max",
      { column: "c", limits: { min: { type: "bigint", value: "10" }, max: 5 } },
    ],
    ["a negative length", { column: "c", limits: { length: { max: -1 } } }],
    ["a fractional length", { column: "c", limits: { length: { max: 1.5 } } }],
    ["notes that are not text", { column: "c", limits: { notes: [1] } }],
  ])("%s is rejected", ({ row: [, entry] }) => {
    expect(() =>
      census.begin({ limits: [entry as unknown as ColumnLimits] }),
    ).toThrow(CensusError.InvalidOptionError);
  });

  test("a column given limits twice is rejected", () => {
    expect(() =>
      census.begin({
        limits: [
          { column: "c", limits: { max: 1 } },
          { column: "c", limits: { min: 0 } },
        ],
      }),
    ).toThrow(CensusError.InvalidOptionError);
  });
});

describe("suggestions admit declared limits", () => {
  test("a number admits the declared range", () => {
    expect(
      column(
        spread(200, (i) => i),
        INT2,
      ),
    ).toMatchObject({ kind: "number", admits: { min: -32768, max: 32767 } });
  });

  test("an end left undeclared admits no limit", () => {
    const suggestion = column(
      spread(200, (i) => i),
      { max: 1000 },
    );
    if (suggestion.kind !== "number") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({ max: 1000 });
  });

  test("a declared end inside the drawn range is dropped, with a note", () => {
    const suggestion = column(
      spread(200, (i) => i),
      { min: 10, max: 100, notes: ["declared"] },
    );
    if (suggestion.kind !== "number") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({});
    const notes = suggestion.notes.join(" ");
    expect(notes).toContain("declared minimum value, 10");
    expect(notes).toContain("declared maximum value, 100");
    expect(suggestion.notes).not.toContain("declared");
  });

  test("a string admits the declared length, and the limits' notes", () => {
    const suggestion = column(
      spread(200, (i) => `s${i}`),
      { length: { max: 12 }, notes: ["counted in code points"] },
    );
    if (suggestion.kind !== "string") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({ length: { max: 12 } });
    expect(suggestion.notes).toContain("counted in code points");
  });

  test("a declared length shorter than drawn is dropped, with a note", () => {
    const suggestion = column(
      spread(200, (i) => `s${i}`),
      { length: { max: 3 } },
    );
    if (suggestion.kind !== "string") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({ length: {} });
    expect(suggestion.notes.join(" ")).toContain("declared maximum length, 3");
  });

  test("a bigint admits the declared range as decimal strings", () => {
    const suggestion = column(
      spread(200, (i) => BigInt(i) * BigInt(2) ** BigInt(55)),
      {
        min: { type: "bigint", value: "-9223372036854775808" },
        max: { type: "bigint", value: "9223372036854775807" },
      },
    );
    if (suggestion.kind !== "bigint") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({
      min: "-9223372036854775808",
      max: "9223372036854775807",
    });
  });

  test("a date admits the declared range as ISO strings", () => {
    const day = 86_400_000;
    const suggestion = column(
      spread(200, (i) => new Date(i * day)),
      { min: -day, max: 1000 * day },
    );
    if (suggestion.kind !== "date") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({
      min: new Date(-day).toISOString(),
      max: new Date(1000 * day).toISOString(),
    });
  });

  test("a date end past what a Date holds declares nothing", () => {
    const suggestion = column(
      spread(200, (i) => new Date(i * 86_400_000)),
      { max: 1e17 },
    );
    if (suggestion.kind !== "date") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({});
  });

  test("an array admits the declared element count", () => {
    const suggestion = column(
      spread(200, (i) => spread(i % 6, (j) => j * 1.5 + i)),
      { length: { max: 10 } },
    );
    if (suggestion.kind !== "array") throw new Error(suggestion.kind);
    expect(suggestion.admits).toEqual({ length: { max: 10 } });
  });

  test("a column holding several types takes no limits", () => {
    const suggestion = column(
      spread(200, (i) => (i % 2 === 0 ? i : `s${i}`)),
      { min: -1000, max: 1000, length: { max: 12 } },
    );
    if (suggestion.kind !== "choice") throw new Error(suggestion.kind);
    expect(suggestion.options.map(([, option]) => option)).toMatchObject([
      { admits: {} },
      { admits: { length: {} } },
    ]);
  });

  test("an enum takes no limits, nor their notes", () => {
    const suggestion = column(
      spread(200, (i) => ["a", "b", "c"][i % 3]),
      { length: { max: 12 }, notes: ["declared"] },
    );
    expect(suggestion.kind).toBe("enum");
    expect(suggestion.notes).not.toContain("declared");
  });

  test("report renders a declared end in place of no limit", () => {
    const rows = spread(200, (i) => ({ n: i, s: `s${i}` }));
    const text = report(
      census.from(rows, {
        seed: "limits",
        limits: [
          { column: "n", limits: INT2 },
          { column: "s", limits: { length: { max: 12 } } },
        ],
      }),
    );
    expect(text).toContain(".admits({ min: -32768, max: 32767 })");
    expect(text).toContain(".admits({ length: { min: 0, max: 12 } })");
  });

  test("admitted limits build in core", () => {
    const { T } = initialize({ salt: "limits", clock: new Date(0) });
    const number = column(
      spread(200, (i) => i),
      INT2,
    );
    const string = column(
      spread(200, (i) => `s${i}`),
      { length: { max: 12 } },
    );
    if (number.kind !== "number" || string.kind !== "string")
      throw new Error(`${number.kind} ${string.kind}`);

    const { min, max } = number.whereby;
    expect(() =>
      T.number.integer
        .whereby({ min, max })
        .admits({ min: number.admits.min!, max: number.admits.max! }),
    ).not.toThrow();

    const { length } = string.whereby;
    expect(() =>
      T.string
        .whereby({ length })
        .admits({ length: { min: 0, max: string.admits.length.max! } }),
    ).not.toThrow();
  });
});
