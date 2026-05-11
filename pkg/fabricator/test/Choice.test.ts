import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("T.choice.uniform builds and fabricates standalone, drawing every option across enough draws", () => {
  const { T, Fabricator } = initialize({ seed: "choice-uniform-standalone" });

  const built = new Fabricator(
    T.choice.uniform([T.always("a"), T.always("b"), T.always("c")]),
  );

  const seen = new Set<string>();
  for (let i = 0; i < 100 && seen.size < 3; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set(["a", "b", "c"]));
});

test("T.choice.uniform is roughly an equal split across options", () => {
  const { T, Fabricator } = initialize({ seed: "choice-uniform-distribution" });

  const built = new Fabricator(
    T.choice.uniform([T.always("a"), T.always("b"), T.always("c")]),
  );

  const counts = { a: 0, b: 0, c: 0 };
  const n = 9000;
  for (let i = 0; i < n; i++) counts[built.fabricate()]++;

  // Generous tolerance around 1/3 (3000 of 9000).
  for (const key of ["a", "b", "c"] as const) {
    expect(counts[key]).toBeGreaterThan(n / 3 - 400);
    expect(counts[key]).toBeLessThan(n / 3 + 400);
  }
});

test("T.choice.weighted draws relative to the given [weight, schema] pairs, not an equal split", () => {
  const { T, Fabricator } = initialize({
    seed: "choice-weighted-distribution",
  });

  const built = new Fabricator(
    T.choice.weighted([
      [6, T.always("USD")],
      [3, T.always("YEN")],
      [1, T.always("GBP")],
    ]),
  );

  const counts = { USD: 0, YEN: 0, GBP: 0 };
  const n = 10000;
  for (let i = 0; i < n; i++) counts[built.fabricate()]++;

  // Weights sum to 10: USD ~60%, YEN ~30%, GBP ~10%.
  expect(counts.USD).toBeGreaterThan(n * 0.5);
  expect(counts.USD).toBeLessThan(n * 0.7);
  expect(counts.YEN).toBeGreaterThan(n * 0.22);
  expect(counts.YEN).toBeLessThan(n * 0.38);
  expect(counts.GBP).toBeGreaterThan(n * 0.05);
  expect(counts.GBP).toBeLessThan(n * 0.15);
});

test("T.choice's options can be arbitrary, differently-kinded schemas", () => {
  const { T, Fabricator } = initialize({ seed: "choice-mixed-kinds" });

  const built = new Fabricator(
    T.choice.uniform([
      T.string.whereby({ length: { max: 5 } }),
      T.number.integer,
    ]),
  );

  const kinds = new Set<string>();
  for (let i = 0; i < 100 && kinds.size < 2; i++) {
    kinds.add(typeof built.fabricate());
  }

  expect(kinds).toEqual(new Set(["string", "number"]));
});

test("T.choice only dispatches the option it draws — other options' streams stay untouched", () => {
  const seed = "choice-only-picked-draws";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    seed,
    clock: "seeded",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    seed,
    clock: "seeded",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withChoice = new Fabricator2(
    T2.object({
      a: T2.choice.uniform([T2.string.whereby({ length: { max: 5 } })]),
      b: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withChoice.fabricate().b).toBe(plain.fabricate().b);
  }
});

test(".override({ key: value }) forces a choice field to that value", () => {
  const { T, Fabricator } = initialize({ seed: "choice-override" });

  const schema = T.object({
    a: T.choice.uniform([T.always("x"), T.always("y")]),
  }).override({ a: "y" });

  expect(new Fabricator(schema).fabricate().a).toBe("y");
});

test(".as(...) replaces the roll with an opaque producer", () => {
  const { T, Fabricator } = initialize({ seed: "choice-as" });

  const built = new Fabricator(
    T.object({
      a: T.choice.uniform([T.always("x"), T.always("y")]).as(() => "x"),
    }),
  );

  expect(built.fabricate()).toEqual({ a: "x" });
  expect(built.fabricate()).toEqual({ a: "x" });
});

test("T.choice.uniform/.weighted throw on an empty option list", () => {
  const { T } = initialize({ seed: "choice-empty" });

  // @ts-expect-error — `uniform` requires at least one option.
  expect(() => T.choice.uniform([])).toThrow();
  // @ts-expect-error — `weighted` requires at least one option.
  expect(() => T.choice.weighted([])).toThrow();
});

test("T.choice.weighted throws on a negative weight", () => {
  const { T } = initialize({ seed: "choice-negative-weight" });

  expect(() =>
    T.choice.weighted([
      [-1, T.always("a")],
      [1, T.always("b")],
    ]),
  ).toThrow();
});

test("T.choice.weighted still constructs and fabricates when every weight is positive", () => {
  const { T, Fabricator } = initialize({ seed: "choice-all-positive-weights" });

  const built = new Fabricator(
    T.choice.weighted([
      [1, T.always("a")],
      [1, T.always("b")],
    ]),
  );

  const seen = new Set<string>();
  for (let i = 0; i < 100 && seen.size < 2; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set(["a", "b"]));
});
