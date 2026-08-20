import { expect, test } from "bun:test";
import { Omitted, initialize } from "@ghostry/fabricator";
import {
  plan,
  resolve,
  type Axis,
  type Pin,
  type Resolvable,
} from "@ghostry/fabricator/internal";

/**
 * Drives `plan`/`resolve` directly — no public API exists yet (that's phases
 * 4/5). Enumerates every "product"-strategy combination a built Fabricator
 * has.
 */
function enumerateAll(built: any): { width: bigint; results: unknown[] } {
  const axis: Axis = plan(built, { strategy: "product" });
  const results: unknown[] = [];

  for (let i = BigInt(0); i < axis.width; i++) {
    const pin: Pin = axis.at(i);
    results.push(resolve(built, pin));
  }

  return { width: axis.width, results };
}

test("an enum and a boolean field multiply: 3 members x 2 = 6", () => {
  const { T, Fabricator } = initialize({ seed: "plan-product-basic" });
  const built = new Fabricator(
    T.object({ e: T.enum.uniform(["a", "b", "c"]), b: T.boolean }),
  );

  const { width, results } = enumerateAll(built);

  expect(width).toBe(BigInt(6));

  const pairs = new Set(results.map((r: any) => `${r.e}:${r.b}`));
  expect(pairs.size).toBe(6);
  for (const e of ["a", "b", "c"]) {
    for (const b of [true, false]) {
      expect(pairs.has(`${e}:${b}`)).toBe(true);
    }
  }
});

test("tuple slots multiply: two booleans give 4 combinations", () => {
  const { T, Fabricator } = initialize({ seed: "plan-tuple" });
  const built = new Fabricator(T.tuple([T.boolean, T.boolean]));

  const { width, results } = enumerateAll(built);

  expect(width).toBe(BigInt(4));
  const combos = new Set(results.map((r: any) => `${r[0]}:${r[1]}`));
  expect(combos.size).toBe(4);
});

test("choice sums its options' widths rather than multiplying them", () => {
  const { T, Fabricator } = initialize({ seed: "plan-choice-sum" });
  const built = new Fabricator(
    T.choice.uniform([T.enum.uniform(["x", "y", "z"]), T.boolean]),
  );

  const { width, results } = enumerateAll(built);

  // 3 + 2 = 5, not 3 x 2 = 6 — only one branch is realized per instance.
  expect(width).toBe(BigInt(5));
  expect(new Set(results)).toEqual(new Set(["x", "y", "z", true, false]));
});

test("T.omittable is a 2-wide axis: absent and present", () => {
  const { T, Fabricator } = initialize({ seed: "plan-omittable" });
  const built = new Fabricator(T.object({ a: T.omittable(T.always("x")) }));

  const { width, results } = enumerateAll(built);

  expect(width).toBe(BigInt(2));
  expect(results.some((r: any) => !("a" in r))).toBe(true);
  expect(results.some((r: any) => r.a === "x")).toBe(true);
});

test("T.optional is a 3-wide axis: absent, present-as-undefined, present", () => {
  const { T, Fabricator } = initialize({ seed: "plan-optional" });
  const built = new Fabricator(T.object({ a: T.optional(T.always("x")) }));

  const { width, results } = enumerateAll(built);

  expect(width).toBe(BigInt(3));
  expect(results.some((r: any) => !("a" in r))).toBe(true);
  expect(results.some((r: any) => "a" in r && r.a === undefined)).toBe(true);
  expect(results.some((r: any) => r.a === "x")).toBe(true);
});

test("T.nullable/T.nullish/T.undefinable are 2/3/2-wide axes", () => {
  const { T, Fabricator } = initialize({ seed: "plan-wrappers" });

  expect(
    plan(new Fabricator(T.nullable(T.always("x"))), { strategy: "product" })
      .width,
  ).toBe(BigInt(2));
  expect(
    plan(new Fabricator(T.nullish(T.always("x"))), { strategy: "product" })
      .width,
  ).toBe(BigInt(3));
  expect(
    plan(new Fabricator(T.undefinable(T.always("x"))), { strategy: "product" })
      .width,
  ).toBe(BigInt(2));
});

test(".as(...) collapses enum/boolean/choice/tuple/object to width 1", () => {
  const { T, Fabricator } = initialize({ seed: "plan-as-collapses" });

  const cases = [
    new Fabricator(T.enum.uniform(["a", "b", "c"]).as(() => "a")),
    new Fabricator(T.boolean.as(() => true)),
    new Fabricator(
      T.choice.uniform([T.always("a"), T.always("b")]).as(() => "a"),
    ),
    new Fabricator(T.tuple([T.boolean, T.boolean]).as(() => [true, false])),
    new Fabricator(T.object({ a: T.boolean }).as(() => ({ a: true }))),
  ];

  for (const built of cases) {
    expect(plan(built as Resolvable, { strategy: "product" }).width).toBe(
      BigInt(1),
    );
  }
});

test("[Fixed] from .override() pins a field to width 1, including an omittable pinned to Omitted", () => {
  const { T, Fabricator } = initialize({ seed: "plan-fixed" });

  const overridden = T.object({ a: T.enum.uniform(["x", "y"]) }).override({
    a: "y",
  });
  const built = new Fabricator(overridden);
  const { width, results } = enumerateAll(built);

  expect(width).toBe(BigInt(1));
  expect((results[0] as any).a).toBe("y");

  const overriddenOmit = T.object({ a: T.omittable(T.always("x")) }).override({
    a: Omitted,
  });
  const builtOmit = new Fabricator(overriddenOmit);
  const omitResult = enumerateAll(builtOmit);

  expect(omitResult.width).toBe(BigInt(1));
  expect("a" in (omitResult.results[0] as any)).toBe(false);
});

test("a .refine()-computed field adds no axis, and still resolves correctly against pinned values", () => {
  const { T, Fabricator } = initialize({ seed: "plan-compute" });

  const schema = T.object({ e: T.enum.uniform(["a", "b"]) }).refine(
    ({ compute }) => ({
      upper: compute(T.string).as(({ fabricated }) =>
        fabricated.e.toUpperCase(),
      ),
    }),
  );
  const built = new Fabricator(schema);

  const { width, results } = enumerateAll(built);

  expect(width).toBe(BigInt(2));
  for (const r of results as any[]) {
    expect(r.upper).toBe(r.e.toUpperCase());
  }
});

test("non-enumerable kinds stay width 1 — array/record don't enumerate their contents", () => {
  const { T, Fabricator } = initialize({ seed: "plan-non-enumerable" });

  const built = new Fabricator(
    T.object({
      e: T.enum.uniform(["a", "b"]),
      list: T.array(T.boolean).whereby({ length: { max: 2 } }),
      rec: T.record(
        T.string.whereby({ length: { max: 3 } }),
        T.boolean,
      ).whereby({ size: { max: 2 } }),
    }),
  );

  expect(plan(built, { strategy: "product" }).width).toBe(BigInt(2));
});

test("a recursive field stays width 1 — its body/self are never planned", () => {
  const { T, Fabricator } = initialize({ seed: "plan-recursive" });

  const built = new Fabricator(
    T.object({
      e: T.enum.uniform(["a", "b"]),
      tree: T.recursive((self) =>
        T.object({
          value: T.boolean,
          children: T.array(self).whereby({ length: { max: 1 } }),
        }),
      ).whereby({ depth: { max: 1 } }),
    }),
  );

  expect(plan(built, { strategy: "product" }).width).toBe(BigInt(2));
});

test("non-enumerated fields are still fuzzed across resolved instances", () => {
  const { T, Fabricator } = initialize({ seed: "plan-still-fuzzed" });

  const built = new Fabricator(
    T.object({
      e: T.enum.uniform(["a", "b"]),
      s: T.string.whereby({ length: { max: 24 } }),
    }),
  );

  const { results } = enumerateAll(built);
  const strings = new Set((results as any[]).map((r) => r.s));

  // Two enumerated instances, each independently drawing its own string —
  // vanishingly unlikely to collide by chance.
  expect(strings.size).toBe(2);
});
