import { expect, test } from "bun:test";
import { initialize, registry } from "@ghostry/fabricator";

/**
 * The registry `initialize()` hands back, so the helpers below stay typed.
 * Instantiated explicitly: a bare `ReturnType<typeof initialize>` resolves the
 * type parameter to its _constraint_ (`PlainObject`) rather than its default,
 * which would leave every `T.<kind>` as `unknown`.
 */
type Registry = ReturnType<typeof initialize<typeof registry>>["T"];

/** Bounded so keys are short, distinct-ish, and readable in a failure. */
const key = (T: Registry) =>
  T.string.whereby({
    length: { min: 4, max: 8 },
    composition: { lowercase: 1 },
  });

/** Bounded so the assertions below read clearly against a known range. */
const value = (T: Registry) => T.number.integer.whereby({ min: 0, max: 1000 });

test("T.record fabricates a plain object keyed by its key schema", () => {
  const { T, Fabricator } = initialize({ seed: "record-basic" });

  const built = new Fabricator(
    T.record(key(T), value(T)).whereby({ size: { max: 4, minTried: 2 } }),
  );

  const fabricated = built.fabricate();

  expect(Object.getPrototypeOf(fabricated)).toBe(Object.prototype);
  for (const [k, v] of Object.entries(fabricated)) {
    expect(k).toMatch(/^[a-z]{4,8}$/);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1000);
  }
});

test("size stays within max and is actually fuzzed across draws", () => {
  const { T, Fabricator } = initialize({ seed: "record-size" });

  const built = new Fabricator(
    T.record(key(T), value(T)).whereby({ size: { max: 5, minTried: 1 } }),
  );

  const sizes = new Set<number>();
  for (let i = 0; i < 500; i++) {
    sizes.add(Object.keys(built.fabricate()).length);
  }

  /** `max` is a hard bound; collisions can only ever shrink the result. */
  for (const size of sizes) {
    expect(size).toBeLessThanOrEqual(5);
    expect(size).toBeGreaterThanOrEqual(1);
  }

  /** More than one distinct size, i.e. the count is drawn rather than fixed. */
  expect(sizes.size).toBeGreaterThan(1);
});

/**
 * With a key schema wide enough that collisions are vanishingly unlikely,
 * `minTried` is observed as a real lower bound — the half of the contract that
 * _is_ reliable. `array` had this wrong for its own `length.min` until it was
 * fixed to use the same inclusive draw; see `test/Array.test.ts`.
 */
test("minTried is honored as a lower bound when collisions are unlikely", () => {
  const { T, Fabricator } = initialize({ seed: "record-min-tried" });

  const built = new Fabricator(
    T.record(
      T.string.whereby({ length: { min: 12, max: 16 } }),
      value(T),
    ).whereby({ size: { max: 6, minTried: 4 } }),
  );

  for (let i = 0; i < 300; i++) {
    const size = Object.keys(built.fabricate()).length;
    expect(size).toBeGreaterThanOrEqual(4);
    expect(size).toBeLessThanOrEqual(6);
  }
});

/**
 * The assertion that catches a regression from `Object.defineProperty` back to
 * bracket assignment. `obj["__proto__"] = v` silently mutates the prototype
 * instead of creating a property, and a fuzzed key schema can reach that key
 * for real — here it is pinned so the case is deterministic.
 */
test("a __proto__ key becomes an own property and does not pollute", () => {
  const { T, Fabricator } = initialize({ seed: "record-pollution" });

  const built = new Fabricator(
    T.record(T.always("__proto__"), value(T)).whereby({
      size: { max: 1, minTried: 1 },
    }),
  );

  const fabricated = built.fabricate();

  expect(Object.getPrototypeOf(fabricated)).toBe(Object.prototype);
  expect(Object.prototype.hasOwnProperty.call(fabricated, "__proto__")).toBe(
    true,
  );
  expect(Object.keys(fabricated)).toEqual(["__proto__"]);
  expect(typeof (fabricated as Record<string, unknown>)["__proto__"]).toBe(
    "number",
  );

  /** Nothing leaked onto the shared prototype. */
  expect(({} as Record<string, unknown>)["pwned"]).toBeUndefined();
});

/**
 * A key schema with only 10 possible values, asked for 10 entries: collisions
 * are effectively certain, and they collapse rather than throwing or redrawing.
 * This is exactly what `minTried`'s name exists to communicate.
 */
test("colliding keys collapse instead of throwing", () => {
  const { T, Fabricator } = initialize({ seed: "record-collisions" });

  const built = new Fabricator(
    T.record(
      T.string.whereby({
        length: { min: 1, max: 1 },
        composition: { digit: 1 },
      }),
      value(T),
    ).whereby({ size: { max: 10, minTried: 10 } }),
  );

  const sizes: number[] = [];
  for (let i = 0; i < 200; i++) {
    sizes.push(Object.keys(built.fabricate()).length);
  }

  expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
  /** At least one draw lost entries to a collision. */
  expect(Math.min(...sizes)).toBeLessThan(10);
});

test("symbol keys fabricate, invisible to Object.keys", () => {
  const { T, Fabricator } = initialize({ seed: "record-symbol" });

  const built = new Fabricator(
    T.record(T.symbol, value(T)).whereby({ size: { max: 3, minTried: 3 } }),
  );

  const fabricated = built.fabricate();

  /** Distinct symbols never collide, so all three survive. */
  expect(Object.getOwnPropertySymbols(fabricated)).toHaveLength(3);
  expect(Object.keys(fabricated)).toEqual([]);
});

/**
 * The `attributes` field from `README.md`'s example, verbatim. Kept as a test
 * because this README has previously documented API that did not typecheck —
 * the annotation below is the part that matters, since it pins the shape the
 * docs implicitly promise.
 */
test("README's T.record example builds, typechecks, and fabricates", () => {
  const { T, Fabricator } = initialize({ seed: "record-readme" });

  const built = new Fabricator(
    T.object({
      attributes: T.record(
        T.string.whereby({ length: { min: 4, max: 12 } }),
        T.string.whereby({ length: { max: 40 } }),
      ).whereby({ size: { max: 6, minTried: 2 } }),
    }),
  );

  const fabricated: { attributes: Record<string, string> } = built.fabricate();
  const entries = Object.entries(fabricated.attributes);

  expect(entries.length).toBeGreaterThanOrEqual(1);
  expect(entries.length).toBeLessThanOrEqual(6);
  for (const [k, v] of entries) {
    expect(k.length).toBeGreaterThanOrEqual(4);
    expect(k.length).toBeLessThanOrEqual(12);
    expect(typeof v).toBe("string");
  }
});

test("the same seed reproduces the same record", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "record-reproducible",
      clock: "seeded",
    });
    return new Fabricator(
      T.record(key(T), value(T)).whereby({ size: { max: 5, minTried: 1 } }),
    );
  };

  const a = build();
  const b = build();

  for (let i = 0; i < 20; i++) {
    expect(a.fabricate()).toEqual(b.fabricate());
  }
});
