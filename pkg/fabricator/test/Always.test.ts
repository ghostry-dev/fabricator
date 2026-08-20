import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

/**
 * `always` and `enum` used to be capped at `string | number | boolean` —
 * TypeBox's `TLiteralValue` leaking into the primitives. These cover the values
 * that cap excluded.
 */

test("T.always fabricates values the old string|number|boolean cap excluded", () => {
  const { T, Fabricator } = initialize({ seed: "always-widened" });

  expect(new Fabricator(T.always(null)).fabricate()).toBe(null);
  expect(new Fabricator(T.always(undefined)).fabricate()).toBe(undefined);
  expect(new Fabricator(T.always(BigInt(5))).fabricate()).toBe(BigInt(5));
  expect(new Fabricator(T.always(new Date(0))).fabricate()).toEqual(
    new Date(0),
  );
  expect(new Fabricator(T.always({ a: 1 })).fabricate()).toEqual({ a: 1 });
  expect(new Fabricator(T.always([1, "a"])).fabricate()).toEqual([1, "a"]);
});

/**
 * `README.md`'s own example of a nullable union member. It did not typecheck
 * while `always.Value` was capped — `T.always(null)` was documented API that
 * could not be written. Kept as a test so the docs and the types can't drift
 * apart again.
 */
test("README's T.always(null) union example builds and fabricates", () => {
  const { T, Fabricator } = initialize({ seed: "always-readme" });

  const built = new Fabricator(
    T.object({
      discount: T.choice.uniform([
        T.always(null),
        T.number.whereby({ min: 0, max: 100 }),
      ]),
    }),
  );

  const seen = new Set<unknown>();
  for (let i = 0; i < 200 && seen.size < 2; i++) {
    const { discount }: { discount: number | null } = built.fabricate();
    seen.add(discount === null ? null : "number");
  }

  expect(seen).toEqual(new Set([null, "number"]));
});

test("T.enum draws from members the old cap excluded", () => {
  const { T, Fabricator } = initialize({ seed: "enum-widened" });

  const built = new Fabricator(T.enum.uniform([null, BigInt(5)]));

  const seen = new Set<unknown>();
  for (let i = 0; i < 100 && seen.size < 2; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set([null, BigInt(5)]));
});
