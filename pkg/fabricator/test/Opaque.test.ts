import { expect, test } from "bun:test";
import { initialize, type ProduceContext } from "@ghostry/fabricator";

/**
 * `T.opaque` is the escape hatch for values no kind models. Before it, the only
 * routes were `T.always(value)` — which hands back the _same reference_ every
 * call — and an accidental `T.enum.uniform([dummy]).as(...)` trick that
 * required a throwaway member purely to fix the type. Neither could produce a
 * reproducible fresh value, which is what these cover.
 */

class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

/**
 * The reason `ProduceContext` is a public export: a producer written as a
 * standalone named function has to be able to name its own parameter type. If
 * this stops compiling, the export has regressed.
 */
function shipping({ random }: ProduceContext): Map<string, number> {
  return new Map([["zone", Math.floor(random.next() * 5) + 1]]);
}

test("the public ProduceContext type names a standalone producer", () => {
  const { T, Fabricator } = initialize({ seed: "opaque-stream-export" });

  const built = new Fabricator(T.object({ shipping: T.opaque(shipping) }));
  const fabricated: { shipping: Map<string, number> } = built.fabricate();

  expect(fabricated.shipping).toBeInstanceOf(Map);
  expect(fabricated.shipping.get("zone")).toBeGreaterThanOrEqual(1);
  expect(fabricated.shipping.get("zone")).toBeLessThanOrEqual(5);
});

test("produces a fresh value per call, unlike T.always", () => {
  const { T, Fabricator } = initialize({ seed: "opaque-fresh" });

  const opaque = new Fabricator(T.opaque(() => new Map([["k", 1]])));
  const a = opaque.fabricate();
  const b = opaque.fabricate();

  expect(a).toBeInstanceOf(Map);
  expect(a).toEqual(b);
  /** The point of the kind: equal by value, never the same object. */
  expect(a).not.toBe(b);

  /** Contrast, so the distinction is pinned rather than implied. */
  const shared = new Map([["k", 1]]);
  const always = new Fabricator(T.always(shared));
  expect(always.fabricate()).toBe(always.fabricate());
});

test("fabricates values no other kind models", () => {
  const { T, Fabricator } = initialize({ seed: "opaque-long-tail" });

  const built = new Fabricator(
    T.object({
      map: T.opaque(() => new Map<string, number>([["a", 1]])),
      set: T.opaque(() => new Set(["a", "b"])),
      url: T.opaque(() => new URL("https://example.test/path")),
      regexp: T.opaque(() => /^[a-z]+$/u),
      bytes: T.opaque(() => new Uint8Array([1, 2, 3])),
      point: T.opaque(() => new Point(1, 2)),
    }),
  );

  const fabricated = built.fabricate();

  expect(fabricated.map).toBeInstanceOf(Map);
  expect(fabricated.set).toBeInstanceOf(Set);
  expect(fabricated.url).toBeInstanceOf(URL);
  expect(fabricated.regexp).toBeInstanceOf(RegExp);
  expect(fabricated.bytes).toBeInstanceOf(Uint8Array);
  expect(fabricated.point).toBeInstanceOf(Point);

  /** The inferred types are the producers' return types, not `unknown`. */
  const size: number = fabricated.map.size;
  const host: string = fabricated.url.host;
  const x: number = fabricated.point.x;
  expect([size, host, x]).toEqual([1, "example.test", 1]);
});

/**
 * The assertion that justifies `produce` taking the stream at all. If the
 * parameter were ever swapped for a fresh or unseeded source, or dropped so
 * callers reached for `Math.random()`, this is what would fail.
 */
test("a producer using the stream replays from the same seed", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "opaque-reproducible",
      clock: "seeded",
    });
    return new Fabricator(
      T.opaque(({ random }) => new Map([["k", random.next()]])),
    );
  };

  const a = build();
  const b = build();

  for (let i = 0; i < 50; i++) {
    expect(a.fabricate()).toEqual(b.fabricate());
  }
});

test("different seeds produce different opaque values", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const build = (seed: string) => {
    const { T, Fabricator } = initialize({ seed, clock });
    return new Fabricator(T.opaque(({ random }) => random.next()));
  };

  expect(build("one").fabricate()).not.toBe(build("two").fabricate());
});

test("the producer's stream advances across calls", () => {
  const { T, Fabricator } = initialize({ seed: "opaque-advances" });

  const built = new Fabricator(T.opaque(({ random }) => random.next()));

  const drawn = new Set<number>();
  for (let i = 0; i < 100; i++) drawn.add(built.fabricate());

  /** A pinned stream would collapse all 100 draws onto one value. */
  expect(drawn.size).toBe(100);
});

/**
 * Unlike every other `produce`-driven path — where `produce` means "no
 * randomness needed" and the stream is never drawn — an opaque schema always
 * takes one, because the stream is what `produce` is handed.
 */
/**
 * The counterpart to `random.test.ts`'s "every kind carries a defined `.trace`"
 * — this is the positive case `opaque` exists to be: a kind that _always_
 * draws, because its stream is what `produce` is handed.
 */
test("an opaque Fabricator always carries a trace, unlike always", () => {
  const { T, Fabricator } = initialize({ seed: "opaque-trace" });

  const opaque = new Fabricator(T.opaque(() => new Map()));
  const traced = opaque.trace;

  expect(traced).toBeDefined();
  expect(traced.kind).toBe("opaque");
});

test("composes as an array element and a record value", () => {
  const { T, Fabricator } = initialize({ seed: "opaque-composes" });

  const array = new Fabricator(
    T.array(T.opaque(() => new Set([1]))).whereby({
      length: { min: 2, max: 2 },
    }),
  );
  const elements = array.fabricate();
  expect(elements).toHaveLength(2);
  expect(elements.every((e) => e instanceof Set)).toBe(true);
  /** Each element is independently produced, not one shared reference. */
  expect(elements[0]).not.toBe(elements[1]);

  const record = new Fabricator(
    T.record(
      T.string.whereby({ length: { min: 3, max: 6 } }),
      T.opaque(() => new Map([["v", 1]])),
    ).whereby({ size: { max: 3, minTried: 1 } }),
  );
  const values = Object.values(record.fabricate());
  expect(values.length).toBeGreaterThanOrEqual(1);
  expect(values.every((v) => v instanceof Map)).toBe(true);
});

/**
 * The `shipping` field from `README.md`'s example, verbatim. Kept as a test
 * because this README has documented API that did not typecheck before — the
 * annotation below is the part that matters, since it pins the shape the docs
 * implicitly promise.
 */
test("README's T.opaque example builds, typechecks, and replays", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "opaque-readme",
      clock: "seeded",
    });
    return new Fabricator(
      T.object({
        shipping: T.opaque(
          ({ random }) =>
            new Map([
              ["zone", Math.floor(random.next() * 5) + 1],
              ["days", Math.floor(random.next() * 10) + 1],
            ]),
        ),
      }),
    );
  };

  const fabricated: { shipping: Map<string, number> } = build().fabricate();

  expect(fabricated.shipping).toBeInstanceOf(Map);
  expect(fabricated.shipping.get("zone")).toBeGreaterThanOrEqual(1);
  expect(fabricated.shipping.get("zone")).toBeLessThanOrEqual(5);
  expect(fabricated.shipping.get("days")).toBeGreaterThanOrEqual(1);
  expect(fabricated.shipping.get("days")).toBeLessThanOrEqual(10);

  /** The point the doc comment makes: it replays from the seed. */
  expect(build().fabricate()).toEqual(build().fabricate());
});

/**
 * An opaque-valued field is an ordinary full-replacement leaf — no changes were
 * needed in `object`'s `Override`, which only holds because `opaque.Core`
 * carries the phantom `[Produces]`.
 */
test("an opaque field can be overridden wholesale", () => {
  const { T, Fabricator } = initialize({ seed: "opaque-override" });

  const schema = T.object({ payload: T.opaque(() => new Map([["a", 1]])) });
  const pinned = new Map([["b", 2]]);

  expect(
    new Fabricator(schema.override({ payload: pinned })).fabricate(),
  ).toEqual({ payload: pinned });

  expect(new Fabricator(schema).fabricate({ payload: pinned })).toEqual({
    payload: pinned,
  });
});
