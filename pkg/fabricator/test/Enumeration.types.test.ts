import { expect, test } from "bun:test";
import { initialize, registry } from "@ghostry/fabricator";
import type { ValueOf } from "@ghostry/fabricator/internal";

/**
 * Compile-time assertions — see `Fabrication.types.test.ts` for why `Equal`/
 * `Expect` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Extends<A, B> = A extends B ? true : false;
type Expect<_ extends true> = true;

const { T, combinatorial, coverage } = initialize({ types: registry });

const schema = T.object({
  a: T.enum.uniform(["x", "y"]),
  b: T.omittable(T.always(1)),
});

const enumerated = combinatorial(schema);
const covered = coverage(schema);

export type Assertions = [
  Expect<Equal<typeof enumerated, Iterable<ValueOf<typeof schema>>>>,
  // `combinatorial` and `coverage` share one type — strategy and limit are
  // both invisible in the signature.
  Expect<Equal<typeof enumerated, typeof covered>>,
  // `Pretty`'s trailing `& {}` defeats a strict `Equal` against a
  // hand-written literal shape, so compare by mutual assignability instead
  // — same idiom `Fabrication.types.test.ts` uses.
  Expect<Extends<ValueOf<typeof schema>, { a: "x" | "y"; b?: 1 }>>,
  Expect<Extends<{ a: "x" | "y"; b?: 1 }, ValueOf<typeof schema>>>,
  // `T.omittable`'s wrapped key must be a real `?:`, not `b: 1 | undefined`.
  Expect<
    Equal<
      Equal<ValueOf<typeof schema>, { a: "x" | "y"; b: 1 | undefined }>,
      false
    >
  >,
];

test("combinatorial(schema) enumerations typecheck", () => {
  // The assertions above are compile-time; this keeps the suite non-empty
  // and sanity-checks that a resolved enumeration actually produces values.
  const results = [...enumerated];
  expect(results.length).toBeGreaterThan(0);
  for (const r of results) {
    expect(["x", "y"]).toContain(r.a);
  }
});

test("coverage(schema) enumerations typecheck", () => {
  const results = [...covered];
  expect(results.length).toBeGreaterThan(0);
  for (const r of results) {
    expect(["x", "y"]).toContain(r.a);
  }
});
