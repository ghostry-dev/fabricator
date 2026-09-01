import { expect, test } from "bun:test";
import { initialize, registry } from "@ghostry/fabricator";
import {
  coverageFromHere,
  enumerableSharedSchema,
} from "./fixtures/sharedSchema";

test("count is the widest single axis, not the product", () => {
  const { T, coverage } = initialize({ salt: "coverage-widest-axis" });

  const results = [
    ...coverage(
      T.object({
        e: T.enum.uniform(["a", "b", "c"]),
        ch: T.choice.uniform([T.always("x"), T.always("y")]),
      }),
    ),
  ];

  // enum3 x choice2 as a product would be 6; coverage needs only 3 — the
  // wider of the two axes.
  expect(results).toHaveLength(3);
});

test("every option of every axis appears at least once", () => {
  const { T, coverage } = initialize({ salt: "coverage-every-option" });

  const results = [
    ...coverage(
      T.object({
        e: T.enum.uniform(["a", "b", "c"]),
        ch: T.choice.uniform([T.always("x"), T.always("y")]),
      }),
    ),
  ];

  expect(new Set(results.map((r) => r.e))).toEqual(new Set(["a", "b", "c"]));
  expect(new Set(results.map((r) => r.ch))).toEqual(new Set(["x", "y"]));
});

test("a narrower product-node axis reuses an option to fill the schedule", () => {
  const { T, coverage } = initialize({ salt: "coverage-cycle-reuse" });

  const results = [
    ...coverage(
      T.object({
        e3: T.enum.uniform(["a", "b", "c"]),
        e2: T.enum.uniform(["x", "y"]),
      }),
    ),
  ];

  expect(results).toHaveLength(3);
  // The 2-wide axis can't produce 3 distinct values across 3 instances —
  // one of "x"/"y" must repeat.
  const e2Values = results.map((r) => r.e2);
  expect(new Set(e2Values).size).toBe(2);
  expect(e2Values).toHaveLength(3);
});

test("sum widths participate in the max, not just product-node widths", () => {
  const { T, coverage } = initialize({ salt: "coverage-sum-participates" });

  const results = [
    ...coverage(
      T.object({
        a: T.nullable(T.enum.uniform(["a", "b", "c"])),
        b: T.enum.uniform(["1", "2", "3", "4", "5"]),
      }),
    ),
  ];

  // nullable(enum3) is a 4-wide sum (null + 3 members); enum5 is wider — 5
  // instances, and `a` (width 4) must cycle to fill them.
  expect(results).toHaveLength(5);
  const aOutcomes = new Set(results.map((r) => (r.a === null ? "null" : r.a)));
  expect(aOutcomes).toEqual(new Set(["null", "a", "b", "c"]));
});

test("the combinatorial limit does not apply to coverage", () => {
  const { T, coverage } = initialize({
    salt: "coverage-no-limit",
    limits: { combinatorial: 4 },
  });

  // Product would be 2 x 2 x 2 = 8, over the configured combinatorial
  // limit — coverage only needs `max(2,2,2) = 2` and must not throw.
  const schema = T.object({ a: T.boolean, b: T.boolean, c: T.boolean });

  expect(() => [...coverage(schema)]).not.toThrow();
  expect([...coverage(schema)]).toHaveLength(2);
});

test("the coverage guarantee holds regardless of which permutation salt produced it", () => {
  for (const salt of [
    "coverage-guard-1",
    "coverage-guard-2",
    "coverage-guard-3",
  ]) {
    const { T, coverage } = initialize({ salt, clock: "derived" });

    const results = [
      ...coverage(
        T.object({
          e: T.enum.uniform(["a", "b", "c"]),
          f: T.enum.uniform(["x", "y"]),
        }),
      ),
    ];

    expect(new Set(results.map((r) => r.e))).toEqual(new Set(["a", "b", "c"]));
    expect(new Set(results.map((r) => r.f))).toEqual(new Set(["x", "y"]));
  }
});

test("equal-width axes are decorrelated across salts, not locked to a fixed diagonal", () => {
  const pairsSeen = new Set<string>();

  for (let i = 0; i < 20; i++) {
    const { T, coverage } = initialize({ salt: `coverage-decorrelate-${i}` });

    const results = [
      ...coverage(
        T.object({
          a: T.enum.uniform(["a0", "a1", "a2"]),
          b: T.enum.uniform(["b0", "b1"]),
        }),
      ),
    ];

    for (const r of results) pairsSeen.add(`${r.a}:${r.b}`);
  }

  // A naive `i % width` schedule can only ever produce the pairs
  // (a0,b0), (a1,b1), (a2,b0) — three of the six possible pairs. Across many
  // salts, a real permutation must eventually land outside that set.
  const fixedDiagonal = new Set(["a0:b0", "a1:b1", "a2:b0"]);
  const sawOutsideDiagonal = [...pairsSeen].some(
    (pair) => !fixedDiagonal.has(pair),
  );
  expect(sawOutsideDiagonal).toBe(true);
});

test("two boolean fields of the same width are not locked in lockstep across salts", () => {
  let sawEqual = false;
  let sawUnequal = false;

  for (let i = 0; i < 20 && !(sawEqual && sawUnequal); i++) {
    const { T, coverage } = initialize({ salt: `coverage-lockstep-${i}` });

    const results = [...coverage(T.object({ x: T.boolean, y: T.boolean }))];

    for (const r of results) {
      if (r.x === r.y) sawEqual = true;
      else sawUnequal = true;
    }
  }

  // A constant per-axis phase offset can only ever make two equal-width
  // axes either always equal or always opposite — never both, on any run.
  expect(sawEqual).toBe(true);
  expect(sawUnequal).toBe(true);
});

test("coverage(schema) reproduces identically for the same instance salt", () => {
  const { T, coverage } = initialize({ salt: "coverage-reproducible" });

  const schema = () =>
    T.object({
      e: T.enum.uniform(["a", "b", "c"]),
      f: T.enum.uniform(["x", "y"]),
    });

  expect([...coverage(schema())]).toEqual([...coverage(schema())]);
});

test("iterating the same returned Iterable twice reproduces identically", () => {
  const { T, coverage } = initialize({ salt: "coverage-reiterate" });

  const iterable = coverage(
    T.object({
      e: T.enum.uniform(["a", "b", "c"]),
      s: T.string.whereby({ length: { max: 10 } }),
    }),
  );

  expect([...iterable]).toEqual([...iterable]);
});

test("Array.from(...) doesn't misattribute randomness relative to a plain for...of", () => {
  const { T, coverage } = initialize({ salt: "coverage-native-frame" });

  const schema = T.object({
    e: T.enum.uniform(["a", "b", "c"]),
    s: T.string.whereby({ length: { max: 10 } }),
  });

  const viaArrayFrom = Array.from(coverage(schema));

  const viaForOf: Array<(typeof viaArrayFrom)[number]> = [];
  for (const value of coverage(schema)) viaForOf.push(value);

  expect(viaArrayFrom).toEqual(viaForOf);
});

test("coverage(...) never perturbs an unrelated Fabricator built from the same instance", () => {
  function unrelatedAfter(coverageCalls: number) {
    const { T, Fabricator, coverage } = initialize({
      salt: "coverage-isolation",
      clock: "derived",
    });

    const schema = T.object({ e: T.enum.uniform(["a", "b", "c"]) });
    for (let i = 0; i < coverageCalls; i++) [...coverage(schema)];

    return new Fabricator(
      T.number.integer.whereby({ min: 0, max: 999_999 }),
    ).fabricate();
  }

  expect(unrelatedAfter(0)).toBe(unrelatedAfter(3));
});

test("coverage(...) reproduces regardless of which file it's called from", () => {
  const { coverage } = initialize({ salt: "coverage-file-independence" });

  const here = coverageFromHere(coverage);
  const there = [...coverage(enumerableSharedSchema())];

  expect(here).toEqual(there);
});

test("two instances with the same salt cover identically; different salts diverge", () => {
  const shape = (T: typeof registry) =>
    T.object({
      e: T.enum.uniform(["a", "b", "c"]),
      s: T.string.whereby({ length: { max: 10 } }),
    });

  const clock = new Date("2020-01-01T00:00:00.000Z");
  const a = initialize({ salt: "coverage-salt-a", clock });
  const b = initialize({ salt: "coverage-salt-a", clock });
  const c = initialize({ salt: "coverage-salt-c", clock });

  expect([...a.coverage(shape(a.T))]).toEqual([...b.coverage(shape(b.T))]);
  expect([...a.coverage(shape(a.T))]).not.toEqual([...c.coverage(shape(c.T))]);
});

test("coverage() never yields a zero-weighted outcome", () => {
  const { T, coverage } = initialize({ salt: "coverage-zero-weight" });

  const results = [
    ...coverage(
      T.enum.weighted([
        [0, "a"],
        [1, "b"],
        [1, "c"],
      ]),
    ),
  ];

  expect(results).not.toContain("a");
  expect(new Set(results)).toEqual(new Set(["b", "c"]));
});

test("a zero-weighted first choice option is not selected by compacted index", () => {
  const { T, coverage } = initialize({
    salt: "coverage-choice-original-index",
  });

  const results = [
    ...coverage(
      T.choice.weighted([
        [0, T.always("a")],
        [1, T.always("b")],
      ]),
    ),
  ];

  expect(results).toEqual(["b"]);
});
