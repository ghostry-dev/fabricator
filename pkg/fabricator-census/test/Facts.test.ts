import {
  census,
  CensusError,
  suggest,
  type ColumnFacts,
  type Facts,
  type Suggestion,
} from "@ghostry/fabricator-census";
import { describe, expect, test } from "bun:test";

/** One column's suggestion, from rows `{ [column]: value }` and its facts. */
function column(
  values: unknown[],
  facts: Facts | Facts[],
  name = "c",
): Suggestion {
  const entries: ColumnFacts[] = (Array.isArray(facts) ? facts : [facts]).map(
    (f) => ({ column: name, facts: f }),
  );
  const root = suggest(
    census.from(
      values.map((value) => ({ [name]: value })),
      { seed: "facts", facts: entries },
    ),
  );
  if (root.kind !== "object") throw new Error(root.kind);
  return root.fields.find((f) => f.key === name)!.value;
}

const exact = (facts: Omit<Facts, "source">): Facts => ({
  ...facts,
  source: "exact",
});
const estimate = (facts: Omit<Facts, "source">): Facts => ({
  ...facts,
  source: "estimate",
});

function integers(count: number): number[];
function integers<$T>(count: number, f: (i: number) => $T): $T[];
function integers(count: number, f: (i: number) => unknown = (i) => i) {
  return Array.from({ length: count }, (_, i) => f(i));
}

describe("the facts option", () => {
  test("facts are recorded on the census and survive JSON", () => {
    const facts: ColumnFacts[] = [
      {
        column: "id",
        facts: exact({
          count: 10,
          nulls: 0,
          max: { type: "bigint", value: "9007199254740993" },
        }),
      },
    ];
    const result = census.from([{ id: 1 }], { facts });
    expect(result.facts).toEqual(facts);
    expect(result.facts).not.toBe(facts);
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });

  test("a census without facts records none", () => {
    expect(census.from([1]).facts).toEqual([]);
  });

  test("facts that are not an array are rejected", () => {
    expect(() =>
      census.begin({ facts: { column: "c" } as unknown as ColumnFacts[] }),
    ).toThrow(CensusError.InvalidOptionError);
  });

  test.each([
    [
      "nulls above count",
      { column: "c", facts: exact({ count: 1, nulls: 2 }) },
    ],
    [
      "a negative count",
      { column: "c", facts: exact({ count: -1, nulls: 0 }) },
    ],
    [
      "an unknown source",
      { column: "c", facts: { count: 1, nulls: 0, source: "guess" } },
    ],
    ["no column name", { facts: exact({ count: 1, nulls: 0 }) }],
  ])("%s is rejected", (_, entry) => {
    expect(() =>
      census.begin({ facts: [entry as unknown as ColumnFacts] }),
    ).toThrow(CensusError.InvalidOptionError);
  });
});

describe("presence", () => {
  test("null weights come from the table, not the sample", () => {
    expect(
      column(integers(50), exact({ count: 1000, nulls: 100 })),
    ).toMatchObject({ kind: "nullable", weights: { null: 100, value: 900 } });
  });

  test("a table without nulls drops the nulls a sample saw", () => {
    const suggestion = column(
      [...integers(50), null],
      exact({ count: 1000, nulls: 0 }),
    );
    expect(suggestion.kind).toBe("number");
  });

  test("a column the table holds only nulls in is T.null", () => {
    expect(column([null, null], exact({ count: 9, nulls: 9 }))).toMatchObject({
      kind: "null",
    });
  });

  test("values the sample never saw are flagged rather than invented", () => {
    const suggestion = column([null, null], exact({ count: 9, nulls: 2 }));
    expect(suggestion).toMatchObject({
      kind: "nullable",
      weights: { null: 2, value: 7 },
      inner: { kind: "opaque" },
    });
  });

  test("a type mix uses facts for presence only", () => {
    const suggestion = column(
      [...integers(20), ..."abcdefghij".split("")],
      exact({ count: 100, nulls: 10, min: -1e6, max: 1e6 }),
    );
    expect(suggestion).toMatchObject({
      kind: "nullable",
      weights: { null: 10, value: 90 },
      inner: { kind: "choice" },
    });
    if (suggestion.kind !== "nullable" || suggestion.inner.kind !== "choice")
      return;
    const number = suggestion.inner.options[0]![1];
    expect(number).toMatchObject({ whereby: { min: 0, max: 19 } });
  });
});

describe("ranges", () => {
  /**
   * A skew toward the minimum leaves its highest values rare, so a sample
   * misses the true maximum: the table's extreme sits just past the sample's.
   */
  test("the table's extremes widen the range; the sample fits its shape", () => {
    const skewed = integers(4000, (i) => 100 * (i / 4000) ** 3);
    const suggestion = column(
      skewed,
      exact({ count: 1e6, nulls: 0, min: 0, max: 102 }),
    );
    expect(suggestion).toMatchObject({
      kind: "number",
      integer: false,
      whereby: { min: 0, max: 102, distribution: { kind: "skew" } },
    });
  });

  test("extremes narrower than the sample never shrink it", () => {
    const suggestion = column(
      integers(200),
      estimate({ count: 1e4, nulls: 0, min: 10, max: 20 }),
    );
    expect(suggestion).toMatchObject({ whereby: { min: 0, max: 199 } });
  });

  test("bigint extremes stay exact", () => {
    const suggestion = column(
      [BigInt("9007199254740993"), BigInt("9007199254741000")],
      exact({
        count: 2,
        nulls: 0,
        min: { type: "bigint", value: "-9007199254740993" },
        max: { type: "bigint", value: "9007199254741999" },
      }),
    );
    expect(suggestion).toMatchObject({
      kind: "bigint",
      whereby: { min: "-9007199254740993", max: "9007199254741999" },
    });
  });

  test("date extremes widen a date range", () => {
    const day = 864e5;
    const dates = integers(
      200,
      (i) => new Date(Date.UTC(2024, 0, 1) + i * day),
    );
    const suggestion = column(
      dates,
      exact({
        count: 5000,
        nulls: 0,
        min: Date.UTC(2023, 0, 1),
        max: Date.UTC(2025, 0, 1),
      }),
    );
    expect(suggestion).toMatchObject({
      kind: "date",
      whereby: {
        min: "2023-01-01T00:00:00.000Z",
        max: "2025-01-01T00:00:00.000Z",
      },
    });
  });

  test("text lengths come from the table when the sample saw no astral characters", () => {
    const words = integers(
      300,
      (i) => "x".repeat(i % 5) + String(i).padStart(3, "0"),
    );
    expect(
      column(
        words,
        exact({ count: 1e5, nulls: 0, length: { min: 1, max: 30 } }),
      ),
    ).toMatchObject({
      kind: "string",
      whereby: { length: { min: 1, max: 30 } },
    });
  });

  test("with astral characters the sample's UTF-16 lengths stand, with a note", () => {
    const words = integers(300, (i) => "😀".repeat(1 + (i % 4)) + i);
    const suggestion = column(
      words,
      exact({ count: 1e5, nulls: 0, length: { min: 1, max: 30 } }),
    );
    expect(suggestion).toMatchObject({ kind: "string" });
    if (suggestion.kind !== "string") return;
    expect(suggestion.whereby.length).not.toMatchObject({ min: 1, max: 30 });
    expect(suggestion.notes.join(" ")).toContain("code points");
  });

  test("array lengths come from the table", () => {
    const arrays = integers(100, (i) => integers(i % 3));
    expect(
      column(
        arrays,
        exact({ count: 1e4, nulls: 0, length: { min: 0, max: 9 } }),
      ),
    ).toMatchObject({ kind: "array", whereby: { length: { min: 0, max: 9 } } });
  });
});

describe("enums", () => {
  const statuses = integers(100, (i) => (i % 10 < 7 ? "active" : "banned"));

  test("a complete top is the enum, with the table's weights", () => {
    const suggestion = column(
      statuses,
      exact({
        count: 1e6,
        nulls: 0,
        top: [
          { value: "active", count: 600_000 },
          { value: "banned", count: 300_000 },
          { value: "pending", count: 100_000 },
        ],
        complete: true,
      }),
    );
    expect(suggestion).toMatchObject({
      kind: "enum",
      items: [
        [600_000, "active"],
        [300_000, "banned"],
        [100_000, "pending"],
      ],
    });
  });

  test("a table with too many distinct values is no enum, however repetitive the sample", () => {
    const suggestion = column(
      statuses,
      estimate({ count: 1e6, nulls: 0, distinct: 900_000 }),
    );
    expect(suggestion.kind).toBe("string");
    expect(suggestion.notes.join(" ")).toContain("900000 distinct");
  });

  test("an incomplete top leaves the sample's members, with a note", () => {
    const suggestion = column(
      statuses,
      exact({
        count: 1e6,
        nulls: 0,
        top: [{ value: "active", count: 700_000 }],
        complete: false,
      }),
    );
    expect(suggestion.kind).toBe("enum");
    expect(suggestion.notes.join(" ")).toContain("rare ones may be missing");
  });

  test("a single value in a complete top is T.always", () => {
    expect(
      column(
        ["x", "x"],
        exact({
          count: 50,
          nulls: 0,
          top: [{ value: "x", count: 50 }],
          complete: true,
        }),
      ),
    ).toMatchObject({ kind: "always", value: "x" });
  });

  test("boolean weights come from the table", () => {
    const suggestion = column(
      [true, false, true],
      exact({
        count: 1000,
        nulls: 0,
        top: [
          { value: true, count: 250 },
          { value: false, count: 750 },
        ],
        complete: true,
      }),
    );
    expect(suggestion).toMatchObject({
      kind: "boolean",
      weights: { true: 250, false: 750 },
    });
  });
});

describe("uniqueness and sequences", () => {
  const shuffled = integers(500, (i) => ((i * 7919) % 1000) + 1);

  test("a serial column is a sequence, though its sample is shuffled", () => {
    const suggestion = column(shuffled, [
      exact({ count: 1000, nulls: 0, min: 1, max: 1000 }),
      estimate({ count: 1000, nulls: 0, distinct: 1000 }),
    ]);
    expect(suggestion.kind).toBe("sequence");
  });

  test("estimated extremes do not make a sequence", () => {
    const suggestion = column(
      shuffled,
      estimate({ count: 1000, nulls: 0, min: 1, max: 1000, distinct: 1000 }),
    );
    expect(suggestion.kind).toBe("number");
  });

  test("gaps or repeats are not a sequence", () => {
    const suggestion = column(
      shuffled,
      exact({ count: 1000, nulls: 0, min: 1, max: 1000, distinct: 999 }),
    );
    expect(suggestion.kind).toBe("number");
  });

  test("distinct counts equal to the values note uniqueness", () => {
    const suggestion = column(
      integers(300, (i) => i * 3),
      exact({ count: 5000, nulls: 0, distinct: 5000, min: 0, max: 20_000 }),
    );
    expect(suggestion.notes.join(" ")).toContain("Every value is distinct");
  });
});

describe("precedence", () => {
  test("exact fields win over estimated ones, which fill the gaps", () => {
    const suggestion = column(integers(50), [
      estimate({ count: 990, nulls: 300, min: 0, max: 49 }),
      exact({ count: 1000, nulls: 100 }),
    ]);
    expect(suggestion).toMatchObject({
      kind: "nullable",
      weights: { null: 100, value: 900 },
    });
  });

  test("estimated figures are flagged; facts' own notes are carried", () => {
    const suggestion = column(
      integers(50),
      estimate({ count: 1000, nulls: 10, notes: ["numeric precision note"] }),
    );
    expect(suggestion.notes).toEqual([
      "numeric precision note",
      "Some figures here are the planner's estimates, drawn from ANALYZE's own sample.",
    ]);
  });

  test("facts apply only to top-level fields", () => {
    const root = suggest(
      census.from([{ outer: { c: 5 } }, { outer: { c: 9 } }], {
        facts: [{ column: "c", facts: exact({ count: 10, nulls: 5 }) }],
      }),
    );
    if (root.kind !== "object") throw new Error(root.kind);
    const outer = root.fields[0]!.value;
    if (outer.kind !== "object") throw new Error(outer.kind);
    expect(outer.fields[0]!.value.kind).toBe("number");
  });
});
