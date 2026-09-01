import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("T.enum.uniform builds and fabricates standalone, drawing every member across enough draws", () => {
  const { T, Fabricator } = initialize({ salt: "enum-uniform-standalone" });

  const built = new Fabricator(T.enum.uniform(["a", "b", "c"]));

  const seen = new Set<string>();
  for (let i = 0; i < 100 && seen.size < 3; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set(["a", "b", "c"]));
});

test("T.enum.uniform is roughly an equal split across members", () => {
  const { T, Fabricator } = initialize({ salt: "enum-uniform-distribution" });

  const built = new Fabricator(T.enum.uniform(["a", "b", "c"]));

  const counts = { a: 0, b: 0, c: 0 };
  const n = 9000;
  for (let i = 0; i < n; i++) counts[built.fabricate()]++;

  // Generous tolerance around 1/3 (3000 of 9000).
  for (const key of ["a", "b", "c"] as const) {
    expect(counts[key]).toBeGreaterThan(n / 3 - 400);
    expect(counts[key]).toBeLessThan(n / 3 + 400);
  }
});

test("T.enum.weighted draws relative to the given [weight, item] pairs, not an equal split", () => {
  const { T, Fabricator } = initialize({ salt: "enum-weighted-distribution" });

  const built = new Fabricator(
    T.enum.weighted([
      [6, "USD"],
      [3, "YEN"],
      [1, "GBP"],
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

test("T.enum's roll never disturbs its object's other randomness", () => {
  const salt = "enum-no-disturb";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    salt,
    clock: "derived",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    salt,
    clock: "derived",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withEnum = new Fabricator2(
    T2.object({ a: T2.enum.uniform(["x", "y", "z"]), b: T2.number }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withEnum.fabricate().b).toBe(plain.fabricate().b);
  }
});

test(".override({ key: value }) forces an enum field to that value", () => {
  const { T, Fabricator } = initialize({ salt: "enum-override" });

  const schema = T.object({ a: T.enum.uniform(["x", "y", "z"]) }).override({
    a: "y",
  });

  expect(new Fabricator(schema).fabricate().a).toBe("y");
});

test(".as(...) replaces the roll with an opaque producer", () => {
  const { T, Fabricator } = initialize({ salt: "enum-as" });

  const built = new Fabricator(
    T.object({ a: T.enum.uniform(["x", "y", "z"]).as(() => "y") }),
  );

  expect(built.fabricate()).toEqual({ a: "y" });
  expect(built.fabricate()).toEqual({ a: "y" });
});

test("T.enum.uniform/.weighted throw on an empty member list", () => {
  const { T } = initialize({ salt: "enum-empty" });

  // @ts-expect-error — `uniform` requires at least one member.
  expect(() => T.enum.uniform([])).toThrow();
  // @ts-expect-error — `weighted` requires at least one member.
  expect(() => T.enum.weighted([])).toThrow();
});

test("T.enum.weighted throws on a negative weight", () => {
  const { T } = initialize({ salt: "enum-negative-weight" });

  expect(() =>
    T.enum.weighted([
      [-1, "a"],
      [1, "b"],
    ]),
  ).toThrow();
});

test("T.enum.weighted still constructs and fabricates when every weight is positive", () => {
  const { T, Fabricator } = initialize({ salt: "enum-all-positive-weights" });

  const built = new Fabricator(
    T.enum.weighted([
      [1, "a"],
      [1, "b"],
    ]),
  );

  const seen = new Set<string>();
  for (let i = 0; i < 100 && seen.size < 2; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set(["a", "b"]));
});
