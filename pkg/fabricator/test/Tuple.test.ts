import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("a tuple fabricates exactly its declared arity, each slot matching its own schema", () => {
  const { T, Fabricator } = initialize({ seed: "tuple-arity" });

  const built = new Fabricator(
    T.tuple([T.string.whereby({ length: { max: 5 } }), T.number, T.date]),
  );

  const result = built.fabricate();

  expect(result).toHaveLength(3);
  expect(typeof result[0]).toBe("string");
  expect(typeof result[1]).toBe("number");
  expect(result[2]).toBeInstanceOf(Date);
});

test("T.tuple([]) fabricates an empty array", () => {
  const { T, Fabricator } = initialize({ seed: "tuple-empty" });

  expect(new Fabricator(T.tuple([])).fabricate()).toEqual([]);
});

test("the same seed reproduces the identical tuple", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "tuple-repro",
      clock: "seeded",
    });
    return new Fabricator(
      T.tuple([T.string.whereby({ length: { max: 5 } }), T.number]),
    ).fabricate();
  };

  expect(build()).toEqual(build());
});

test("a tuple's slots each draw from their own independent stream, unlike array's single shared element stream", () => {
  /**
   * `array` builds one element Fabricator and calls it N times, so its entries
   * are drawn sequentially off one shared stream — the whole sequence traces
   * back to one structural path (`element`). `tuple` builds one
   * independently-keyed Fabricator per slot (`0`, `1`, …), so two same-kind
   * slots produce two genuinely independent sequences of values across repeated
   * builds, rather than the correlated sequence a single shared stream would
   * produce.
   */
  const { T, Fabricator } = initialize({ seed: "tuple-independent-slots" });

  const built = new Fabricator(T.tuple([T.number, T.number]));

  const firsts: number[] = [];
  const seconds: number[] = [];
  for (let i = 0; i < 20; i++) {
    const [a, b] = built.fabricate();
    firsts.push(a);
    seconds.push(b);
  }

  expect(firsts).not.toEqual(seconds);
});

test("a tuple field's slots never disturb a sibling field's own randomness", () => {
  const seed = "tuple-no-disturb";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    seed,
    clock: "seeded",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    seed,
    clock: "seeded",
  });

  const plain = new Fabricator1(T1.object({ b: T1.number }));
  const withTuple = new Fabricator2(
    T2.object({
      pair: T2.tuple([T2.string.whereby({ length: { max: 5 } }), T2.boolean]),
      b: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(withTuple.fabricate().b).toBe(plain.fabricate().b);
  }
});

test(".override({ key: value }) replaces a tuple field wholesale", () => {
  const { T, Fabricator } = initialize({ seed: "tuple-override" });

  const schema = T.object({ pair: T.tuple([T.number, T.number]) });

  const built = new Fabricator(schema.override({ pair: [1, 2] }));

  expect(built.fabricate().pair).toEqual([1, 2]);
});

test("an override value that isn't an array for a tuple field throws", () => {
  const { T } = initialize({ seed: "tuple-override-kind-violation" });

  const schema = T.object({ pair: T.tuple([T.number, T.number]) });

  expect(() =>
    schema.override({ pair: "nope" as unknown as [number, number] }),
  ).toThrow();
});

test("a tuple field nested in an array of objects resolves independently per element", () => {
  const { T, Fabricator } = initialize({ seed: "tuple-in-array" });

  const built = new Fabricator(
    T.array(T.object({ pair: T.tuple([T.number, T.number]) })).whereby({
      length: { min: 20, max: 30 },
    }),
  );

  const results = built.fabricate();
  const firsts = new Set(results.map((r) => r.pair[0]));

  expect(firsts.size).toBeGreaterThan(1);
});

test(".as(...) replaces the whole tuple's production with an opaque producer", () => {
  const { T, Fabricator } = initialize({ seed: "tuple-as" });

  const built = new Fabricator(T.tuple([T.number, T.number]).as(() => [7, 8]));

  expect(built.fabricate()).toEqual([7, 8]);
  expect(built.fabricate()).toEqual([7, 8]);
});
