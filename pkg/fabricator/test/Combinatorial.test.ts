import { expect, test } from "bun:test";
import { Omitted, initialize, registry } from "@ghostry/fabricator";
import {
  combinatorialFromHere,
  enumerableSharedSchema,
} from "./fixtures/sharedSchema";

test("an enum and a boolean field multiply: 3 x 2 = 6 instances", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-basic" });

  const schema = T.object({ e: T.enum.uniform(["a", "b", "c"]), b: T.boolean });

  const results = [...combinatorial(schema)];

  expect(results).toHaveLength(6);
  const pairs = new Set(results.map((r) => `${r.e}:${r.b}`));
  expect(pairs.size).toBe(6);
});

test("tuple slots multiply: two booleans give 4 combinations", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-tuple" });

  const results = [...combinatorial(T.tuple([T.boolean, T.boolean]))];

  expect(results).toHaveLength(4);
  const combos = new Set(results.map((r) => `${r[0]}:${r[1]}`));
  expect(combos.size).toBe(4);
});

test("choice sums its options' widths rather than multiplying them", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-choice-sum" });

  const results = [
    ...combinatorial(
      T.choice.uniform([T.enum.uniform(["x", "y", "z"]), T.boolean]),
    ),
  ];

  expect(results).toHaveLength(5);
  expect(new Set(results)).toEqual(new Set(["x", "y", "z", true, false]));
});

test("T.omittable is a 2-wide axis: absent and present", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-omittable" });

  const results = [
    ...combinatorial(T.object({ a: T.omittable(T.always("x")) })),
  ];

  expect(results).toHaveLength(2);
  expect(results.some((r) => !("a" in r))).toBe(true);
  expect(results.some((r) => r.a === "x")).toBe(true);
});

test("T.optional is a 3-wide axis: absent, present-as-undefined, present", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-optional" });

  const results = [
    ...combinatorial(T.object({ a: T.optional(T.always("x")) })),
  ];

  expect(results).toHaveLength(3);
  expect(results.some((r) => !("a" in r))).toBe(true);
  expect(results.some((r) => "a" in r && r.a === undefined)).toBe(true);
  expect(results.some((r) => r.a === "x")).toBe(true);
});

test("T.nullable/T.nullish/T.undefinable enumerate 2/3/2 instances", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-wrappers" });

  expect([...combinatorial(T.nullable(T.always("x")))]).toHaveLength(2);
  expect([...combinatorial(T.nullish(T.always("x")))]).toHaveLength(3);
  expect([...combinatorial(T.undefinable(T.always("x")))]).toHaveLength(2);
  expect([
    ...combinatorial(T.undefinable(T.always("x")).weighted({ undefined: 0 })),
  ]).toEqual(["x"]);
});

test(".as(...) collapses enum/boolean/choice/tuple/object to a single instance", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-as-collapses",
  });

  expect([
    ...combinatorial(T.enum.uniform(["a", "b", "c"]).as(() => "a")),
  ]).toHaveLength(1);
  expect([...combinatorial(T.boolean.as(() => true))]).toHaveLength(1);
  expect([
    ...combinatorial(
      T.choice.uniform([T.always("a"), T.always("b")]).as(() => "a"),
    ),
  ]).toHaveLength(1);
  expect([
    ...combinatorial(T.tuple([T.boolean, T.boolean]).as(() => [true, false])),
  ]).toHaveLength(1);
  expect([
    ...combinatorial(T.object({ a: T.boolean }).as(() => ({ a: true }))),
  ]).toHaveLength(1);
});

test("[Fixed] from .override() pins a field to a single instance, including an omittable pinned to Omitted", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-fixed" });

  const overridden = T.object({ a: T.enum.uniform(["x", "y"]) }).override({
    a: "y",
  });
  const results = [...combinatorial(overridden)];
  expect(results).toHaveLength(1);
  expect(results[0]!.a).toBe("y");

  const overriddenOmit = T.object({ a: T.omittable(T.always("x")) }).override({
    a: Omitted,
  });
  const omitResults = [...combinatorial(overriddenOmit)];
  expect(omitResults).toHaveLength(1);
  expect("a" in omitResults[0]!).toBe(false);
});

test("a .refine()-computed field adds no axis, and still resolves correctly against each pinned instance", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-compute" });

  const schema = T.object({ e: T.enum.uniform(["a", "b"]) }).refine(
    ({ compute }) => ({
      upper: compute(T.string).as(({ fabricated }) =>
        fabricated.e.toUpperCase(),
      ),
    }),
  );

  const results = [...combinatorial(schema)];
  expect(results).toHaveLength(2);
  for (const r of results) expect(r.upper).toBe(r.e.toUpperCase());
});

test("non-enumerable kinds stay a single axis — array/record don't enumerate their contents", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-non-enumerable",
  });

  const schema = T.object({
    e: T.enum.uniform(["a", "b"]),
    list: T.array(T.boolean).whereby({ length: { max: 2 } }),
    rec: T.record(T.string.whereby({ length: { max: 3 } }), T.boolean).whereby({
      size: { max: 2 },
    }),
  });

  expect([...combinatorial(schema)]).toHaveLength(2);
});

test("non-enumerated fields are still fuzzed across enumerated instances", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-still-fuzzed",
  });

  const results = [
    ...combinatorial(
      T.object({
        e: T.enum.uniform(["a", "b"]),
        s: T.string.whereby({ length: { max: 24 } }),
      }),
    ),
  ];

  const strings = new Set(results.map((r) => r.s));
  // Two enumerated instances, each independently drawing its own string —
  // vanishingly unlikely to collide by chance.
  expect(strings.size).toBe(2);
});

test("the limit throws on a bare call, before any iteration happens", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-limit-eager",
    limits: { combinatorial: 4 },
  });

  const schema = T.object({
    a: T.enum.uniform(["1", "2"]),
    b: T.enum.uniform(["1", "2", "3"]),
  });

  // No spread, no iteration at all — the throw must happen here.
  expect(() => combinatorial(schema)).toThrow(/limit/);
});

test("a schema exactly at the limit does not throw", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-limit-exact",
    limits: { combinatorial: 6 },
  });

  const schema = T.object({
    a: T.enum.uniform(["1", "2"]),
    b: T.enum.uniform(["1", "2", "3"]),
  });

  expect([...combinatorial(schema)]).toHaveLength(6);
});

test("the limit's error message states the exact count, not a lower bound or Infinity", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-limit-exact-count",
    limits: { combinatorial: 10 },
  });

  // 60 independent boolean fields: 2^60 — far past Number.MAX_SAFE_INTEGER,
  // and far too large for `number` to represent exactly.
  const fields: Record<string, ReturnType<typeof T.boolean.as>> = {};
  for (let i = 0; i < 60; i++) fields[`b${i}`] = T.boolean;

  const expected = BigInt(2) ** BigInt(60);

  expect(() => combinatorial(T.object(fields))).toThrow(
    new RegExp(expected.toString(10)),
  );
});

test("initialize() rejects a non-positive or non-integer combinatorial limit eagerly", () => {
  expect(() => initialize({ limits: { combinatorial: 0 } })).toThrow();
  expect(() => initialize({ limits: { combinatorial: -1 } })).toThrow();
  expect(() => initialize({ limits: { combinatorial: 1.5 } })).toThrow();
});

test("calling combinatorial(schema) twice on the same instance reproduces identically", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-repeat" });

  const schema = T.object({
    e: T.enum.uniform(["a", "b", "c"]),
    s: T.string.whereby({ length: { max: 10 } }),
  });

  expect([...combinatorial(schema)]).toEqual([...combinatorial(schema)]);
});

test("iterating the same returned Iterable twice reproduces identically", () => {
  const { T, combinatorial } = initialize({ seed: "combinatorial-reiterate" });

  const schema = T.object({
    e: T.enum.uniform(["a", "b", "c"]),
    s: T.string.whereby({ length: { max: 10 } }),
  });

  const iterable = combinatorial(schema);

  expect([...iterable]).toEqual([...iterable]);
});

test("Array.from(...) doesn't misattribute randomness relative to a plain for...of", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-native-frame",
  });

  const schema = T.object({
    e: T.enum.uniform(["a", "b", "c"]),
    s: T.string.whereby({ length: { max: 10 } }),
  });

  const viaArrayFrom = Array.from(combinatorial(schema));

  const viaForOf: Array<(typeof viaArrayFrom)[number]> = [];
  for (const value of combinatorial(schema)) viaForOf.push(value);

  expect(viaArrayFrom).toEqual(viaForOf);
});

test("combinatorial(...) never perturbs an unrelated Fabricator built from the same instance", () => {
  function unrelatedAfter(combinatorialCalls: number) {
    const { T, Fabricator, combinatorial } = initialize({
      seed: "combinatorial-isolation",
      clock: "seeded",
    });

    const schema = T.object({ e: T.enum.uniform(["a", "b", "c"]) });
    for (let i = 0; i < combinatorialCalls; i++) [...combinatorial(schema)];

    return new Fabricator(
      T.number.integer.whereby({ min: 0, max: 999_999 }),
    ).fabricate();
  }

  expect(unrelatedAfter(0)).toBe(unrelatedAfter(3));
});

test("combinatorial(...) reproduces regardless of which file it's called from", () => {
  const { combinatorial } = initialize({
    seed: "combinatorial-file-independence",
  });

  const here = combinatorialFromHere(combinatorial);
  const there = [...combinatorial(enumerableSharedSchema())];

  expect(here).toEqual(there);
});

test("two instances with the same seed enumerate identically; different seeds diverge", () => {
  const shape = (T: typeof registry) =>
    T.object({
      e: T.enum.uniform(["a", "b", "c"]),
      s: T.string.whereby({ length: { max: 10 } }),
    });

  const clock = new Date("2020-01-01T00:00:00.000Z");
  const a = initialize({ seed: "combinatorial-seed-a", clock });
  const b = initialize({ seed: "combinatorial-seed-a", clock });
  const c = initialize({ seed: "combinatorial-seed-c", clock });

  expect([...a.combinatorial(shape(a.T))]).toEqual([
    ...b.combinatorial(shape(b.T)),
  ]);
  expect([...a.combinatorial(shape(a.T))]).not.toEqual([
    ...c.combinatorial(shape(c.T)),
  ]);
});

test("combinatorial() width shrinks when an enum member is zeroed", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-zero-weight-width",
  });

  const results = [
    ...combinatorial(
      T.object({
        b: T.boolean,
        e: T.enum.weighted([
          [0, "a"],
          [1, "b"],
          [1, "c"],
        ]),
      }),
    ),
  ];

  expect(results).toHaveLength(4);
  expect(results.every((r) => r.e !== "a")).toBe(true);
});

test("a zero-weighted first choice option is not selected by compacted index", () => {
  const { T, combinatorial } = initialize({
    seed: "combinatorial-choice-original-index",
  });

  const results = [
    ...combinatorial(
      T.choice.weighted([
        [0, T.always("a")],
        [1, T.always("b")],
      ]),
    ),
  ];

  expect(results).toEqual(["b"]);
});
