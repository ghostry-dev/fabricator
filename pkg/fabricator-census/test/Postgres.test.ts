import { CensusError } from "@ghostry/fabricator-census";
import {
  aggregates,
  coerce,
  columns,
  count,
  estimate,
  estimatedFacts,
  parseText,
  sample,
  statistics,
  type Column,
  type SampleMethod,
  type SampleOptions,
} from "@ghostry/fabricator-census/postgres";
import { describe, expect, test } from "bun:test";

const column = (name: string, base: string, category: string): Column => ({
  name,
  type: base,
  base,
  category,
  nullable: true,
});

describe("identifiers", () => {
  test("names are double-quoted with quotes doubled", () => {
    const q = count({ schema: 'Sales "EU"', table: "Order Lines" });
    expect(q.text).toBe(
      'SELECT count(*)::float8 AS count FROM "Sales ""EU"""."Order Lines"',
    );
  });

  test("a bare string is one name, never split on dots", () => {
    expect(count("a.b").text).toContain('FROM "a.b"');
  });

  test("catalog lookups pass the quoted name as a parameter to to_regclass", () => {
    const q = estimate({ schema: "public", table: "Users" });
    expect(q.text).toContain("pg_catalog.to_regclass($1)");
    expect(q.values).toEqual(['"public"."Users"']);
  });

  test("an empty name or one with a NUL is refused", () => {
    expect(() => count("")).toThrow(CensusError.InvalidIdentifierError);
    expect(() => count("a\0b")).toThrow(CensusError.InvalidIdentifierError);
  });

  test("column names are quoted in selects and aggregates", () => {
    const q = sample("t", {
      n: 10,
      population: 100,
      columns: ["Select", 'we"ird'],
    });
    expect(q.text).toStartWith('SELECT "Select", "we""ird"\nFROM "t"');
  });
});

describe("parameters", () => {
  /** Every number a caller supplies, written as the SQL text would spell it. */
  const spelled = ["1234", "98765", "4321", "12.34", "0.1234"];

  const common = { n: 1234, population: 10_000, seed: 98765 };
  const byMethod: Record<SampleMethod, SampleOptions> = {
    bernoulli: common,
    system: { ...common, method: "system" },
    hash: { ...common, method: "hash", key: "id" },
  };

  test.each(["bernoulli", "system", "hash"] as const)(
    "%s sampling keeps every caller number out of the text",
    (method) => {
      const q = sample("t", byMethod[method]);
      for (const number of spelled) expect(q.text).not.toContain(number);
      expect(q.values).toContain(98765);
    },
  );

  test("top-k's limit is a parameter", () => {
    const [q] = aggregates("t", [column("status", "text", "S")], {
      topK: 4321,
    });
    expect(q!.text).not.toContain("4321");
    expect(q!.text).not.toContain("4322");
    expect(q!.values).toEqual([4322]);
  });
});

describe("sample", () => {
  test("bernoulli samples the fraction n / population, repeatably under a seed", () => {
    const q = sample("t", { n: 500, population: 10_000, seed: 7 });
    expect(q.text).toBe(
      'SELECT *\nFROM "t"\nTABLESAMPLE BERNOULLI ($1::float4) REPEATABLE ($2::float8)',
    );
    expect(q.values).toEqual([5, 7]);
    expect(q.cost).toBe("sample");
  });

  test("without a seed there is no REPEATABLE clause", () => {
    expect(sample("t", { n: 1, population: 10 }).text).not.toContain(
      "REPEATABLE",
    );
  });

  test("system notes its block-level bias", () => {
    const q = sample("t", { n: 10, population: 100, method: "system" });
    expect(q.text).toContain("TABLESAMPLE SYSTEM");
    expect(q.notes.join(" ")).toContain("biased");
  });

  test("hash keeps rows below fraction · 2^63 of a seeded hash of the key", () => {
    const q = sample("t", {
      n: 1,
      population: 4,
      method: "hash",
      key: "id",
      seed: 3,
    });
    expect(q.text).toBe(
      'SELECT *\nFROM "t"\nWHERE (pg_catalog.hashtextextended("id"::text, $1::int8) & 9223372036854775807) < $2::int8',
    );
    expect(q.values).toEqual([3, String(BigInt(2) ** BigInt(61))]);
  });

  test("n at or past the population takes every row", () => {
    expect(sample("t", { n: 50, population: 10 }).values).toEqual([100]);
    const hash = sample("t", {
      n: 50,
      population: 10,
      method: "hash",
      key: "id",
    });
    expect(hash.text).not.toContain("WHERE");
  });

  test("where is appended as a trusted condition", () => {
    const q = sample("t", {
      n: 1,
      population: 4,
      method: "hash",
      key: "id",
      where: "deleted_at IS NULL",
    });
    expect(q.text).toEndWith("< $2::int8\n  AND (deleted_at IS NULL)");
  });

  test("hash needs a key and an integer seed", () => {
    expect(() =>
      /** @ts-expect-error - hash sampling needs the column it hashes */
      sample("t", { n: 1, population: 4, method: "hash" }),
    ).toThrow(CensusError.InvalidOptionError);
    expect(() =>
      sample("t", {
        n: 1,
        population: 4,
        method: "hash",
        key: "id",
        seed: 0.5,
      }),
    ).toThrow(CensusError.InvalidOptionError);
  });

  test("bad sizes are rejected", () => {
    expect(() => sample("t", { n: 0, population: 4 })).toThrow(
      CensusError.InvalidOptionError,
    );
    expect(() => sample("t", { n: 1, population: -1 })).toThrow(
      CensusError.InvalidOptionError,
    );
  });
});

test("only hash sampling takes a key", () => {
  /** @ts-expect-error - bernoulli would ignore a key */
  const bernoulli: SampleOptions = { n: 1, population: 4, key: "id" };
  /** @ts-expect-error - system would ignore a key */
  const system: SampleOptions = {
    n: 1,
    population: 4,
    method: "system",
    key: "id",
  };
  expect([bernoulli, system]).toHaveLength(2);
});

describe("estimate", () => {
  const q = estimate("t");

  test("reads reltuples as a row count", () => {
    expect(q.read([{ reltuples: 1234.4, relpages: 10 }])).toBe(1234);
    expect(q.read([{ reltuples: "5000", relpages: "40" }])).toBe(5000);
  });

  test("a never-analyzed table reads as null, not as empty", () => {
    expect(q.read([{ reltuples: -1, relpages: 0 }])).toBeNull();
    expect(q.read([{ reltuples: 0, relpages: 0 }])).toBeNull();
  });

  test("no row means no such table", () => {
    expect(() => q.read([])).toThrow(CensusError.UnknownTableError);
  });
});

describe("count", () => {
  test("reads count, as a number or as a driver's string", () => {
    expect(count("t").read([{ count: "42" }])).toBe(42);
    expect(count("t").cost).toBe("scan");
  });

  test("a bigint is rejected, not rounded to a number", () => {
    expect(() =>
      count("t").read([{ count: BigInt("9007199254740993") }]),
    ).toThrow(CensusError.UnexpectedRowError);
  });
});

describe("columns", () => {
  test("looks through domains, skips system and dropped columns", () => {
    const { text } = columns("t");
    expect(text).toContain(
      "LEFT JOIN pg_catalog.pg_type b ON b.oid = t.typbasetype",
    );
    expect(text).toContain("a.attnum > 0");
    expect(text).toContain("NOT a.attisdropped");
  });

  test("reads columns, accepting t/f for booleans", () => {
    expect(
      columns("t").read([
        {
          name: "id",
          type: "bigint",
          base: "int8",
          category: "N",
          nullable: false,
        },
        {
          name: "tags",
          type: "text[]",
          base: "_text",
          category: "A",
          nullable: "t",
        },
      ]),
    ).toEqual([
      {
        name: "id",
        type: "bigint",
        base: "int8",
        category: "N",
        nullable: false,
      },
      {
        name: "tags",
        type: "text[]",
        base: "_text",
        category: "A",
        nullable: true,
      },
    ]);
  });

  test("a malformed row is reported", () => {
    expect(() => columns("t").read([{ name: 1 }])).toThrow(
      CensusError.UnexpectedRowError,
    );
  });
});

describe("statistics", () => {
  const q = statistics("t");

  test("casts value arrays through text[]", () => {
    expect(q.text).toContain("s.most_common_vals::text::text[]");
    expect(q.text).toContain("s.histogram_bounds::text::text[]");
  });

  test("negative n_distinct is a fraction of rows; zero is unknown", () => {
    const [a, b, c] = q.read([
      {
        name: "a",
        null_frac: 0,
        n_distinct: 12,
        most_common_vals: null,
        most_common_freqs: null,
        histogram_bounds: null,
        correlation: 1,
      },
      {
        name: "b",
        null_frac: 0.1,
        n_distinct: -0.5,
        most_common_vals: null,
        most_common_freqs: null,
        histogram_bounds: null,
        correlation: null,
      },
      {
        name: "c",
        null_frac: 0,
        n_distinct: 0,
        most_common_vals: null,
        most_common_freqs: null,
        histogram_bounds: null,
        correlation: null,
      },
    ]);
    expect(a!.distinct).toEqual({ count: 12 });
    expect(b!.distinct).toEqual({ fraction: 0.5 });
    expect(b!.nullFraction).toBe(0.1);
    expect(c!.distinct).toBeNull();
  });

  test("pairs common values with their frequencies, from arrays or array literals", () => {
    const fromArrays = q.read([
      {
        name: "s",
        null_frac: 0,
        n_distinct: 2,
        most_common_vals: ["active", "banned"],
        most_common_freqs: [0.9, 0.1],
        histogram_bounds: null,
        correlation: null,
      },
    ]);
    const fromLiterals = q.read([
      {
        name: "s",
        null_frac: "0",
        n_distinct: "2",
        most_common_vals: '{active,"on \\"hold\\"",NULL}',
        most_common_freqs: "{0.8,0.15,0.05}",
        histogram_bounds: "{a,b}",
        correlation: "0.5",
      },
    ]);
    expect(fromArrays[0]!.common).toEqual([
      { value: "active", frequency: 0.9 },
      { value: "banned", frequency: 0.1 },
    ]);
    expect(fromLiterals[0]!.common).toEqual([
      { value: "active", frequency: 0.8 },
      { value: 'on "hold"', frequency: 0.15 },
      { value: null, frequency: 0.05 },
    ]);
    expect(fromLiterals[0]!.histogram).toEqual(["a", "b"]);
    expect(fromLiterals[0]!.correlation).toBe(0.5);
  });

  test("a table's own row wins over its inherited one", () => {
    const rows = q.read([
      {
        name: "a",
        null_frac: 0.2,
        n_distinct: 1,
        most_common_vals: null,
        most_common_freqs: null,
        histogram_bounds: null,
        correlation: null,
      },
      {
        name: "a",
        null_frac: 0.9,
        n_distinct: 1,
        most_common_vals: null,
        most_common_freqs: null,
        histogram_bounds: null,
        correlation: null,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nullFraction).toBe(0.2);
  });
});

/**
 * PostgreSQL's array literal, as a driver that leaves `text[]` unparsed returns
 * it. Reached through `histogram_bounds`, which `statistics` passes straight
 * through the parser.
 */
describe("array literals", () => {
  const histogram = (literal: unknown) =>
    statistics("t").read([
      {
        name: "c",
        null_frac: 0,
        n_distinct: 1,
        most_common_vals: null,
        most_common_freqs: null,
        histogram_bounds: literal,
        correlation: null,
      },
    ])[0]!.histogram;

  test.each([
    ["{}", []],
    ["{a}", ["a"]],
    ["{a,b,c}", ["a", "b", "c"]],
    ['{"a,b",c}', ["a,b", "c"]],
    ['{"b c"}', ["b c"]],
    ['{"NULL",NULL}', ["NULL", null]],
    ['{""}', [""]],
    ['{"say \\"hi\\""}', ['say "hi"']],
    ['{"a\\\\b"}', ["a\\b"]],
    ['{"{1,2}","{3}"}', ["{1,2}", "{3}"]],
  ] as const)("%s parses", (literal, expected) => {
    expect(histogram(literal)).toEqual([...expected]);
  });

  test.each([
    "a,b",
    "{a",
    '{"a}',
    '{"a"b}',
    "{a,,b}",
    "{a,}",
    "{,a}",
    '{"a\\}',
    "{{a,b}}",
    "{a{b}",
  ])("%s is rejected", (literal) => {
    expect(() => histogram(literal)).toThrow(CensusError.UnexpectedRowError);
  });

  test("an array a driver already parsed passes through, nulls kept", () => {
    expect(histogram(["a", null, 3])).toEqual(["a", null, "3"]);
  });

  test("a non-array value is rejected", () => {
    expect(() => histogram(42)).toThrow(CensusError.UnexpectedRowError);
  });
});

describe("aggregates", () => {
  const table = { schema: "app", table: "users" };
  const [id, email, status, tags, born, payload, active] = aggregates(
    table,
    [
      column("id", "int8", "N"),
      column("email", "text", "S"),
      column("status", "status_kind", "E"),
      column("tags", "_text", "A"),
      column("born", "timestamptz", "D"),
      column("payload", "jsonb", "U"),
      column("active", "bool", "B"),
    ],
    { topK: 2, distinct: "exact" },
  );

  test("one scan query per column, each noting where to run it", () => {
    for (const q of [id, email, status, tags, born, payload, active]) {
      expect(q!.cost).toBe("scan");
      expect(q!.notes.join(" ")).toContain("replica");
    }
  });

  test("numbers get extremes and moments", () => {
    expect(id!.text).toBe(
      [
        "SELECT count(*)::float8 AS count,",
        '  count("id")::float8 AS present,',
        '  count(DISTINCT "id")::float8 AS n_distinct,',
        '  min("id")::text AS min,',
        '  max("id")::text AS max,',
        '  avg("id")::float8 AS mean,',
        '  stddev_samp("id")::float8 AS stddev,',
        "  (SELECT pg_catalog.json_agg(pg_catalog.json_build_array(top.value, top.n))",
        '  FROM (SELECT "id"::text AS value, count(*)::float8 AS n',
        '    FROM "app"."users" WHERE "id" IS NOT NULL',
        '    GROUP BY "id" ORDER BY count(*) DESC, "id"',
        "    LIMIT $1) AS top) AS top",
        'FROM "app"."users"',
      ].join("\n"),
    );
  });

  test("each type gets only the aggregates it supports", () => {
    expect(email!.text).toContain('char_length("email")');
    expect(email!.notes.join(" ")).toContain("code points");
    expect(status!.text).toContain("AS top");
    expect(tags!.text).toContain('cardinality("tags")');
    expect(tags!.text).not.toContain("AS top");
    expect(born!.text).toContain('extract(epoch FROM min("born")) * 1000');
    expect(payload!.text).toBe(
      'SELECT count(*)::float8 AS count,\n  count("payload")::float8 AS present,\n  count(DISTINCT "payload")::float8 AS n_distinct\nFROM "app"."users"',
    );
    expect(active!.text).toContain("AS top");
    expect(active!.text).not.toContain("min(");
  });

  test("reads facts, with nulls as the uncounted rows", () => {
    expect(
      id!.read([
        {
          count: "10",
          present: "8",
          n_distinct: "8",
          min: 1,
          max: 8,
          mean: 4.5,
          stddev: "2.449",
          top: null,
        },
      ]),
    ).toEqual({
      column: "id",
      facts: {
        count: 10,
        nulls: 2,
        distinct: 8,
        min: 1,
        max: 8,
        mean: 4.5,
        stddev: 2.449,
        top: [],
        complete: true,
        source: "exact",
      },
    });
  });

  test("int8 extremes travel as text and stay exact past 2^53", () => {
    const { facts } = id!.read([
      {
        count: 2,
        present: 2,
        n_distinct: 2,
        min: "-5",
        max: "9007199254740993",
        mean: 1,
        stddev: 1,
        top: [
          ["-5", 1],
          ["9007199254740993", 1],
        ],
      },
    ]);
    expect(facts.min).toBe(-5);
    expect(facts.max).toEqual({ type: "bigint", value: "9007199254740993" });
    expect(facts.top).toEqual([
      { value: -5, count: 1 },
      { value: { type: "bigint", value: "9007199254740993" }, count: 1 },
    ]);
  });

  test("numeric extremes travel as text, with a precision note", () => {
    const [amount] = aggregates("t", [column("amount", "numeric", "N")]);
    expect(amount!.text).toContain('min("amount")::text AS min');
    const { facts } = amount!.read([
      {
        count: 1,
        present: 1,
        min: "1.25",
        max: "1e400",
        mean: 1,
        stddev: null,
      },
    ]);
    expect(facts.min).toBe(1.25);
    expect(facts.max).toBe(Infinity);
    expect(facts.notes!.join(" ")).toContain("significant digits");
  });

  test("booleans' most frequent values read as booleans", () => {
    const { facts } = active!.read([
      {
        count: 3,
        present: 3,
        n_distinct: 2,
        top: [
          ["true", 2],
          ["false", 1],
        ],
      },
    ]);
    expect(facts.top).toEqual([
      { value: true, count: 2 },
      { value: false, count: 1 },
    ]);
  });

  test("top-k fetches one extra to tell whether it is complete", () => {
    const facts = (top: unknown) =>
      status!.read([{ count: 9, present: 9, n_distinct: 3, top }]).facts;
    const complete = facts([
      ["a", 5],
      ["b", 4],
    ]);
    expect(complete.complete).toBe(true);
    const partial = facts(
      JSON.stringify([
        ["a", 5],
        ["b", 3],
        ["c", 1],
      ]),
    );
    expect(partial.top).toEqual([
      { value: "a", count: 5 },
      { value: "b", count: 3 },
    ]);
    expect(partial.complete).toBe(false);
  });

  test("text lengths read as a length range", () => {
    const { facts } = email!.read([
      {
        count: 3,
        present: 3,
        n_distinct: 3,
        length_min: 5,
        length_max: 40,
        top: [],
      },
    ]);
    expect(facts.length).toEqual({ min: 5, max: 40 });
  });

  test("topK 0 skips the most-frequent subquery", () => {
    const [q] = aggregates("t", [column("s", "text", "S")], { topK: 0 });
    expect(q!.text).not.toContain("AS top");
    expect(q!.values).toEqual([]);
  });
});

describe("coerce", () => {
  const id = column("id", "int8", "N");
  const amount = column("amount", "numeric", "N");
  const ok = column("ok", "bool", "B");
  const name = column("name", "text", "S");

  test("int8 is a number throughout when every value is safe", () => {
    expect(
      coerce([{ id: "1" }, { id: BigInt(2) }, { id: 3 }, { id: null }], [id]),
    ).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: null }]);
  });

  test("int8 is a bigint throughout once any value is not", () => {
    expect(
      coerce([{ id: 1 }, { id: "9007199254740993" }, { id: BigInt(5) }], [id]),
    ).toEqual([
      { id: BigInt(1) },
      { id: BigInt("9007199254740993") },
      { id: BigInt(5) },
    ]);
  });

  test("numeric text and unparsed booleans are parsed; other types are left alone", () => {
    const at = new Date(0);
    expect(
      coerce(
        [
          { amount: "1.50", ok: "t", name: "12", at },
          { amount: "NaN", ok: "f", name: "x", at },
        ],
        [amount, ok, name, column("at", "timestamptz", "D")],
      ),
    ).toEqual([
      { amount: 1.5, ok: true, name: "12", at },
      { amount: NaN, ok: false, name: "x", at },
    ]);
  });

  test("rows are copied, and a column named __proto__ stays a column", () => {
    const row = JSON.parse('{"__proto__": "7"}') as Record<string, unknown>;
    const [copy] = coerce([row], [column("__proto__", "int4", "N")]);
    expect(copy).not.toBe(row);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(copy, "__proto__")?.value).toBe(7);
    expect(row["__proto__"]).toBe("7");
  });
});

describe("parseText", () => {
  test("text is parsed by the column's type", () => {
    expect(parseText("t", column("b", "bool", "B"))).toBe(true);
    expect(parseText("42", column("n", "int4", "N"))).toBe(42);
    expect(parseText("9223372036854775807", column("n", "int8", "N"))).toEqual({
      type: "bigint",
      value: "9223372036854775807",
    });
    expect(parseText("2.5", column("n", "float8", "N"))).toBe(2.5);
    expect(parseText("$1.00", column("m", "money", "N"))).toBe("$1.00");
    expect(parseText("ok", column("e", "mood", "E"))).toBe("ok");
  });
});

describe("estimatedFacts", () => {
  const stats = (overrides: Record<string, unknown>) =>
    statistics("t").read([
      {
        name: "c",
        null_frac: 0.1,
        n_distinct: -0.5,
        most_common_vals: null,
        most_common_freqs: null,
        histogram_bounds: null,
        correlation: null,
        ...overrides,
      },
    ]);

  test("fractions of ANALYZE's sample scale to the row estimate", () => {
    const [entry] = estimatedFacts(stats({}), [column("c", "text", "S")], 1000);
    expect(entry).toEqual({
      column: "c",
      facts: { count: 1000, nulls: 100, distinct: 500, source: "estimate" },
    });
  });

  test("common values are typed, and complete when they are every distinct value", () => {
    const [entry] = estimatedFacts(
      stats({
        n_distinct: 2,
        most_common_vals: ["1", "2"],
        most_common_freqs: [0.6, 0.3],
        histogram_bounds: null,
      }),
      [column("c", "int4", "N")],
      1000,
    );
    expect(entry!.facts.top).toEqual([
      { value: 1, count: 600 },
      { value: 2, count: 300 },
    ]);
    expect(entry!.facts.complete).toBe(true);
    expect(entry!.facts.min).toBe(1);
    expect(entry!.facts.max).toBe(2);
  });

  test("numeric extremes span histogram bounds and common values, bigints exactly", () => {
    const [entry] = estimatedFacts(
      stats({
        n_distinct: -1,
        most_common_vals: ["-3"],
        most_common_freqs: [0.01],
        histogram_bounds: ["0", "50", "9007199254740993"],
      }),
      [column("c", "int8", "N")],
      100,
    );
    expect(entry!.facts.min).toBe(-3);
    expect(entry!.facts.max).toEqual({
      type: "bigint",
      value: "9007199254740993",
    });
  });

  test("type notes ride along; columns left out are skipped", () => {
    const [entry] = estimatedFacts(
      stats({}),
      [column("c", "timestamp", "D")],
      10,
    );
    expect(entry!.facts.notes!.join(" ")).toContain("local time zone");
    expect(estimatedFacts(stats({}), [], 10)).toEqual([]);
  });
});
