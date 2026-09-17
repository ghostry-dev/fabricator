import { initialize } from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * Pins the batch-and-pool idiom the docs teach: `T.array` for a batch,
 * `T.enum.uniform(pool.map(...))` for a foreign key. If this file and
 * `docs/src/pages/guides/relationships.mdx` disagree, the docs have drifted.
 *
 * `BarSchema` declares `foo_id` itself so the child stays fabricable on its
 * own, exactly as the guide writes it — which also makes the pool assertion
 * below pin that `.extend()` _replaces_ that field rather than leaving its
 * original draw in place.
 *
 * @module
 */

test("a batch of 10 sequenced objects yields ids 1..10, then 11..20 on the next call", () => {
  const { T, Fabricator } = initialize({ salt: "relationships-batch" });

  const FooSchema = T.object({
    id: T.number.integer.sequence,
    name: T.string.whereby({ length: { min: 1, max: 25 } }),
  });

  const Foos = new Fabricator(T.array(FooSchema).whereby({ length: 10 }));

  expect(Foos.fabricate().map((foo) => foo.id)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(Foos.fabricate().map((foo) => foo.id)).toEqual([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  ]);
});

test("an extended child enum over parent ids stays inside the pool", () => {
  const { T, Fabricator } = initialize({ salt: "relationships-pool" });

  const FooSchema = T.object({
    id: T.number.integer.sequence,
    name: T.string.whereby({ length: { min: 1, max: 25 } }),
  });
  const BarSchema = T.object({
    id: T.number.integer.sequence,
    title: T.string.whereby({ length: { min: 1, max: 40 } }),
    foo_id: T.number.integer,
  });

  const foos = new Fabricator(
    T.array(FooSchema).whereby({ length: 10 }),
  ).fabricate();

  const bars = new Fabricator(
    T.array(
      BarSchema.extend(() => ({
        foo_id: T.enum.uniform(foos.map((f) => f.id)),
      })),
    ).whereby({ length: 100 }),
  ).fabricate();

  const pool = new Set(foos.map((f) => f.id));
  for (const bar of bars) {
    expect(pool.has(bar.foo_id)).toBe(true);
  }
});

test("the two-step pool scenario replays under the same salt", () => {
  const run = () => {
    const { T, Fabricator } = initialize({
      salt: "relationships-replay",
      clock: "derived",
    });

    const FooSchema = T.object({
      id: T.number.integer.sequence,
      name: T.string.whereby({ length: { min: 1, max: 25 } }),
    });
    const BarSchema = T.object({
      id: T.number.integer.sequence,
      title: T.string.whereby({ length: { min: 1, max: 40 } }),
      foo_id: T.number.integer,
    });

    const foos = new Fabricator(
      T.array(FooSchema).whereby({ length: 10 }),
    ).fabricate();

    const bars = new Fabricator(
      T.array(
        BarSchema.extend(() => ({
          foo_id: T.enum.uniform(foos.map((f) => f.id)),
        })),
      ).whereby({ length: 100 }),
    ).fabricate();

    return { foos, bars };
  };

  expect(run()).toEqual(run());
});
