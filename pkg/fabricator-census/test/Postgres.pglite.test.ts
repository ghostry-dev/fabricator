import { PGlite } from "@electric-sql/pglite";
import { initialize } from "@ghostry/fabricator";
import {
  census,
  CensusError,
  suggest,
  type Suggestion,
} from "@ghostry/fabricator-census";
import { collect, type Run } from "@ghostry/fabricator-census/postgres";
import { beforeAll, describe, expect, test } from "bun:test";

/**
 * The whole PostgreSQL path against a real PostgreSQL, in process: seed a table
 * from a schema whose every probability is known, `collect` it, take a census,
 * and check the suggestions recover the schema — with the table's exact facts
 * where a sample alone could not know them.
 */
const ROWS = 20_000;
const db = new PGlite();
const run: Run = async (text, values) =>
  (await db.query<Record<string, unknown>>(text, values)).rows;

/** Exact counts straight from the table, to compare suggestions against. */
async function scalar(sql: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(sql);
  return Number(rows[0]!.n);
}

beforeAll(async () => {
  const { T, Fabricator } = initialize({ salt: "pglite", clock: new Date(0) });
  const built = new Fabricator(
    T.object({
      score: T.number.integer.whereby({
        min: 0,
        max: 1000,
        distribution: { kind: "skew", exponent: 2 },
      }),
      manager: T.nullable(
        T.number.integer.whereby({ min: 1, max: 5000 }),
      ).weighted({ null: 1, value: 3 }),
      status: T.enum.weighted([
        [6, "active"],
        [3, "pending"],
        [1, "banned"],
      ]),
      nickname: T.string.whereby({
        length: { min: 3, max: 12 },
        composition: { lowercase: 1 },
      }),
      balance: T.number.whereby({ min: 0, max: 10_000 }),
      big: T.bigint.whereby({
        min: BigInt(2) ** BigInt(60),
        max: BigInt(2) ** BigInt(61),
      }),
    }),
  );

  await db.exec(`
    CREATE TABLE accounts (
      id serial PRIMARY KEY,
      score int4 NOT NULL,
      manager int4,
      status text NOT NULL,
      nickname text NOT NULL,
      balance numeric(12, 2) NOT NULL,
      big int8 NOT NULL
    );
  `);
  const batch = 1000;
  for (let start = 0; start < ROWS; start += batch) {
    const values: unknown[] = [];
    const tuples: string[] = [];
    for (let i = 0; i < batch; i++) {
      const row = built.fabricate();
      const at = values.length;
      tuples.push(
        `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6})`,
      );
      values.push(
        row.score,
        row.manager,
        row.status,
        row.nickname,
        row.balance.toFixed(2),
        String(row.big),
      );
    }
    await db.query(
      `INSERT INTO accounts (score, manager, status, nickname, balance, big) VALUES ${tuples.join(", ")}`,
      values,
    );
  }
  await db.exec("ANALYZE accounts;");
  await db.exec(
    "CREATE TABLE fresh (id int4); INSERT INTO fresh SELECT generate_series(1, 50);",
  );
});

describe("collect", () => {
  let fields: Map<string, Suggestion>;
  let collected: Awaited<ReturnType<typeof collect>>;

  beforeAll(async () => {
    collected = await collect(run, { table: "accounts", sample: { seed: 7 } });
    const root = suggest(
      census.from(collected.rows, { seed: "pglite", facts: collected.facts }),
    );
    if (root.kind !== "object") throw new Error(root.kind);
    fields = new Map(root.fields.map((f) => [f.key, f.value]));
  });

  test("sizes the sample against the estimate, and draws about that many", () => {
    expect(collected.population).toBe(ROWS);
    expect(collected.size.n).toBe(Math.ceil(4612 / (1 + (4612 - 1) / ROWS)));
    expect(Math.abs(collected.rows.length - collected.size.n)).toBeLessThan(
      0.1 * collected.size.n,
    );
  });

  test("runs catalog, sample and scan queries, in that order", () => {
    expect(collected.queries.map((q) => q.cost)).toEqual([
      "catalog",
      "catalog",
      "catalog",
      "sample",
      ...collected.columns.map(() => "scan" as const),
    ]);
  });

  test("a serial id is a sequence, from facts the shuffled sample cannot show", () => {
    expect(fields.get("id")!.kind).toBe("sequence");
  });

  test("null weights are the table's exact counts", async () => {
    const nulls = await scalar(
      "SELECT count(*) AS n FROM accounts WHERE manager IS NULL",
    );
    expect(fields.get("manager")).toMatchObject({
      kind: "nullable",
      weights: { null: nulls, value: ROWS - nulls },
    });
    expect(nulls / ROWS).toBeCloseTo(0.25, 1);
  });

  test("an integer's range is the table's, its skew fitted from the sample", async () => {
    const min = await scalar("SELECT min(score) AS n FROM accounts");
    const max = await scalar("SELECT max(score) AS n FROM accounts");
    const score = fields.get("score")!;
    if (score.kind !== "number" || score.whereby.distribution.kind !== "skew")
      throw new Error(JSON.stringify(score));
    expect(score.whereby.min).toBe(min);
    expect(score.whereby.max).toBe(max);
    expect(Math.abs(score.whereby.distribution.exponent - 2)).toBeLessThan(0.2);
  });

  test("an enum's members and weights are the table's", async () => {
    const counts = Object.fromEntries(
      (
        await db.query<{ status: string; n: number }>(
          "SELECT status, count(*)::int AS n FROM accounts GROUP BY status",
        )
      ).rows.map((r) => [r.status, r.n]),
    );
    const status = fields.get("status")!;
    if (status.kind !== "enum") throw new Error(status.kind);
    expect(Object.fromEntries(status.items.map(([w, v]) => [v, w]))).toEqual(
      counts,
    );
  });

  test("string lengths come from the table", () => {
    expect(fields.get("nickname")).toMatchObject({
      kind: "string",
      whereby: { length: { min: 3, max: 12 } },
    });
  });

  test("numeric is coerced to numbers, with its precision noted", () => {
    const balance = fields.get("balance")!;
    expect(balance.kind).toBe("number");
    expect(balance.notes.join(" ")).toContain("significant digits");
  });

  test("int8 past 2^53 is a bigint, with the table's exact extremes", async () => {
    const { rows } = await db.query<{ lo: string; hi: string }>(
      "SELECT min(big)::text AS lo, max(big)::text AS hi FROM accounts",
    );
    expect(fields.get("big")).toMatchObject({
      kind: "bigint",
      whereby: { min: rows[0]!.lo, max: rows[0]!.hi },
    });
  });
});

describe("sampling", () => {
  const ids = (rows: ReadonlyArray<Record<string, unknown>>) =>
    rows.map((r) => r["id"]).join(",");

  test("bernoulli under a seed draws the same rows twice", async () => {
    const options = {
      table: "accounts",
      budget: "catalog",
      sample: { seed: 11 },
    } as const;
    expect(ids((await collect(run, options)).rows)).toBe(
      ids((await collect(run, options)).rows),
    );
  });

  test("hash sampling under a seed draws the same rows twice", async () => {
    const options = {
      table: "accounts",
      budget: "catalog",
      sample: { method: "hash", key: "id", seed: 3 },
    } as const;
    const first = (await collect(run, options)).rows;
    expect(ids(first)).toBe(ids((await collect(run, options)).rows));
    expect(first.length).toBeGreaterThan(0);
  });
});

describe("budget", () => {
  test("catalog issues no scans, and its facts are all estimates", async () => {
    const collected = await collect(run, {
      table: "accounts",
      budget: "catalog",
    });
    expect(collected.queries.some((q) => q.cost === "scan")).toBe(false);
    expect(collected.facts.every((f) => f.facts.source === "estimate")).toBe(
      true,
    );
    expect(collected.facts.length).toBe(collected.columns.length);
  });

  test("a table never analyzed is counted under a scan budget", async () => {
    const collected = await collect(run, { table: "fresh" });
    expect(collected.population).toBe(50);
    expect(collected.queries[1]!.cost).toBe("scan");
  });

  test("a table never analyzed is an error under a catalog budget", async () => {
    await expect(
      collect(run, { table: "fresh", budget: "catalog" }),
    ).rejects.toThrow(CensusError.UnanalyzedTableError);
  });
});
