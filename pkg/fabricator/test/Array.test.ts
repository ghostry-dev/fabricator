import { expect, test } from "bun:test";
import { FabricatorError, initialize } from "@ghostry/fabricator";

/**
 * `whereby.length.min` was declared in `array/Types.ts` and documented in
 * `array/Registry.ts`, but `array/Fabricator.ts` drew its length as
 * `Math.ceil(stream.next() * max)` and never read `min` at all. Nothing
 * asserted array length against a spec, so the whole suite stayed green — these
 * are the assertions that would have caught it.
 */

test("length.min is honored as a lower bound", () => {
  const { T, Fabricator } = initialize({ salt: "array-min" });

  const built = new Fabricator(
    T.array(T.always("x")).whereby({ length: { min: 5, max: 10 } }),
  );

  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) seen.add(built.fabricate().length);

  for (const length of seen) {
    expect(length).toBeGreaterThanOrEqual(5);
    expect(length).toBeLessThanOrEqual(10);
  }

  /** Both endpoints are reachable — the draw is inclusive, not exclusive. */
  expect(seen.has(5)).toBe(true);
  expect(seen.has(10)).toBe(true);
});

test("exclusive length.min never yields the excluded length", () => {
  const { T, Fabricator } = initialize({ salt: "array-exclusive-min" });
  const built = new Fabricator(
    T.array(T.always("x")).whereby({
      length: { min: { value: 0, exclusive: true }, max: 3 },
    }),
  );

  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) seen.add(built.fabricate().length);
  expect(seen.has(0)).toBe(false);
  expect([...seen].sort()).toEqual([1, 2, 3]);
});

test("an empty array length range throws at whereby", () => {
  const { T } = initialize({ salt: "array-empty-length" });
  expect(() =>
    T.array(T.always("x")).whereby({
      length: { min: 5, max: { value: 5, exclusive: true } },
    }),
  ).toThrow(FabricatorError.EmptyRangeError);
});

/**
 * `min` defaults to 0, so an empty array is a legitimate outcome. The old
 * `Math.ceil` of a `[0, 1)` draw could only reach 0 when `stream.next()`
 * returned exactly 0, making the documented default effectively 1.
 */
test("length.min defaults to 0, so empty arrays occur", () => {
  const { T, Fabricator } = initialize({ salt: "array-default-min" });

  const built = new Fabricator(
    T.array(T.always("x")).whereby({ length: { max: 3 } }),
  );

  const seen = new Set<number>();
  for (let i = 0; i < 3000; i++) seen.add(built.fabricate().length);

  expect([...seen].sort()).toEqual([0, 1, 2, 3]);
});

test("a fixed numeric length is exact", () => {
  const { T, Fabricator } = initialize({ salt: "array-fixed" });

  const built = new Fabricator(T.array(T.always("x")).whereby({ length: 3 }));

  for (let i = 0; i < 50; i++) {
    expect(built.fabricate()).toEqual(["x", "x", "x"]);
  }
});

test("min equal to max pins the length", () => {
  const { T, Fabricator } = initialize({ salt: "array-pinned" });

  const built = new Fabricator(
    T.array(T.always("x")).whereby({ length: { min: 4, max: 4 } }),
  );

  for (let i = 0; i < 50; i++) {
    expect(built.fabricate()).toHaveLength(4);
  }
});

test("the same salt reproduces the same arrays", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      salt: "array-reproducible",
      clock: "derived",
    });
    return new Fabricator(
      T.array(T.number.integer.whereby({ min: 0, max: 9 })).whereby({
        length: { min: 1, max: 5 },
      }),
    );
  };

  const a = build();
  const b = build();

  for (let i = 0; i < 50; i++) expect(a.fabricate()).toEqual(b.fabricate());
});
