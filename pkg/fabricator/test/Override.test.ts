import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("an overridden field's fixed value never disturbs its object's other randomness", () => {
  const salt = "from-skip-test";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    salt,
    clock: "derived",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    salt,
    clock: "derived",
  });

  const base = new Fabricator1(T1.object({ a: T1.number, b: T1.number }));
  const overridden = new Fabricator2(
    T2.object({ a: T2.number, b: T2.number }).override({ a: 999 }),
  );

  const base1 = base.fabricate();
  const base2 = base.fabricate();
  const base3 = base.fabricate();

  const over1 = overridden.fabricate();
  const over2 = overridden.fabricate();
  const over3 = overridden.fabricate();

  expect(over1.a).toBe(999);
  expect(over2.a).toBe(999);
  expect(over3.a).toBe(999);

  // `b` is never overridden, so its draws must line up call-for-call with a
  // build of the same schema shape that never called `.override()` at all.
  expect(over1.b).toBe(base1.b);
  expect(over2.b).toBe(base2.b);
  expect(over3.b).toBe(base3.b);
});

test("a computed field resolves against an overridden upstream value", () => {
  const { T, Fabricator } = initialize({ salt: "compute-consistency" });

  const schema = T.object({
    name: T.string.whereby({ length: { max: 10 } }),
  }).refine(({ compute }) => ({
    greeting: compute(T.string).as(
      ({ fabricated }) => `Hello, ${fabricated.name}`,
    ),
  }));

  const result = new Fabricator(
    schema.override({ name: "Widget" }),
  ).fabricate();

  expect(result.name).toBe("Widget");
  expect(result.greeting).toBe("Hello, Widget");
});

test("overriding a nested object field deep-merges; overriding an array field replaces it wholesale", () => {
  const { T, Fabricator } = initialize({ salt: "nested-merge" });

  const schema = T.object({
    pricing: T.object({
      currency: T.string.whereby({ length: { max: 5 } }),
      amount: T.number.whereby({ min: 1, max: 100 }),
    }),
    tags: T.array(T.string.whereby({ length: { max: 5 } })).whereby({
      length: { max: 3 },
    }),
  });

  const built = new Fabricator(schema);
  const result = new Fabricator(
    built.schema.override({ pricing: { currency: "USD" }, tags: ["x", "y"] }),
  ).fabricate();

  expect(result.pricing.currency).toBe("USD");
  expect(typeof result.pricing.amount).toBe("number");
  expect(result.tags).toEqual(["x", "y"]);
});

test("overriding a computed field directly uses it verbatim when it matches the source kind", () => {
  const { T, Fabricator } = initialize({ salt: "compute-override-ok" });

  const schema = T.object({ createdAt: T.date }).refine(({ compute }) => ({
    day: compute(T.date).as(({ fabricated }) => fabricated.createdAt),
  }));

  const override = new Date("2020-01-01T00:00:00.000Z");
  const result = new Fabricator(schema.override({ day: override })).fabricate();

  expect(result.day).toEqual(override);
});

test("overriding a computed field with a value that violates its source kind throws", () => {
  const { T } = initialize({ salt: "compute-override-bad" });

  const schema = T.object({ createdAt: T.date }).refine(({ compute }) => ({
    day: compute(T.date).as(({ fabricated }) => fabricated.createdAt),
  }));

  expect(() =>
    schema.override({ day: "not-a-date" as unknown as Date }),
  ).toThrow();
});

test("an unknown override key throws immediately at .override()", () => {
  const { T } = initialize({ salt: "unknown-key" });

  const schema = T.object({ name: T.string.whereby({ length: { max: 5 } }) });

  expect(() =>
    schema.override({ nope: 1 } as unknown as { name: string }),
  ).toThrow();
});

test("an override value that violates its field's kind throws immediately at .override()", () => {
  const { T } = initialize({ salt: "kind-violation" });

  const schema = T.object({
    pricing: T.object({ currency: T.string.whereby({ length: { max: 5 } }) }),
    createdAt: T.date,
  });

  expect(() =>
    schema.override({ pricing: null as unknown as { currency: string } }),
  ).toThrow();

  expect(() =>
    schema.override({ createdAt: "nope" as unknown as Date }),
  ).toThrow();
});

test(".override(a).override(b) deep-merges, with b winning on conflicts", () => {
  const { T, Fabricator } = initialize({ salt: "chain-merge" });

  const schema = T.object({
    pricing: T.object({
      currency: T.string.whereby({ length: { max: 5 } }),
      amount: T.number.whereby({ min: 1, max: 100 }),
    }),
    name: T.string.whereby({ length: { max: 10 } }),
  });

  const result = new Fabricator(
    schema
      .override({ pricing: { currency: "USD" } })
      .override({ pricing: { amount: 42 }, name: "Widget" }),
  ).fabricate();

  expect(result.pricing.currency).toBe("USD");
  expect(result.pricing.amount).toBe(42);
  expect(result.name).toBe("Widget");
});

test("fabricate(overrides) uses this Fabricator's own randomness, never a fresh draw", () => {
  const salt = "fabricate-override";
  const { T: T1, Fabricator: Fabricator1 } = initialize({
    salt,
    clock: "derived",
  });
  const { T: T2, Fabricator: Fabricator2 } = initialize({
    salt,
    clock: "derived",
  });

  const plain = new Fabricator1(T1.object({ a: T1.number, b: T1.number }));
  const overridden = new Fabricator2(T2.object({ a: T2.number, b: T2.number }));

  const plain1 = plain.fabricate();
  const plain2 = plain.fabricate();
  const plain3 = plain.fabricate();

  const over1 = overridden.fabricate();
  const over2 = overridden.fabricate({ a: 999 });
  const over3 = overridden.fabricate();

  expect(over2.a).toBe(999);

  // `b` is never overridden, so its draws must line up call-for-call with a
  // Fabricator that never called `.fabricate({...})` with an override at all.
  expect(over1.b).toBe(plain1.b);
  expect(over2.b).toBe(plain2.b);
  expect(over3.b).toBe(plain3.b);

  // `a` was only actually drawn on call 1 and call 3 (call 2 was overridden
  // and must have skipped its draw) — so `overridden`'s 2nd real draw of `a`
  // (call 3) must equal `plain`'s 2nd draw of `a` (call 2).
  expect(over3.a).toBe(plain2.a);
});

test("fabricate(overrides) is a one-off — it never mutates the Fabricator", () => {
  const { T, Fabricator } = initialize({ salt: "fabricate-override-oneoff" });

  const built = new Fabricator(
    T.object({ name: T.string.whereby({ length: { max: 10 } }) }),
  );

  built.fabricate({ name: "Widget" });
  const result = built.fabricate();

  expect(result.name).not.toBe("Widget");
});

test("fabricate(overrides) deep-merges a nested object override directly, no .schema needed", () => {
  const { T, Fabricator } = initialize({ salt: "fabricate-nested" });

  const built = new Fabricator(
    T.object({
      pricing: T.object({
        currency: T.string.whereby({ length: { max: 5 } }),
        amount: T.number.whereby({ min: 1, max: 100 }),
      }),
    }),
  );

  const result = built.fabricate({ pricing: { currency: "USD" } });

  expect(result.pricing.currency).toBe("USD");
  expect(typeof result.pricing.amount).toBe("number");
});

test("fabricate(overrides) resolves a computed field against an overridden upstream value", () => {
  const { T, Fabricator } = initialize({ salt: "fabricate-compute-upstream" });

  const built = new Fabricator(
    T.object({ name: T.string.whereby({ length: { max: 10 } }) }).refine(
      ({ compute }) => ({
        greeting: compute(T.string).as(
          ({ fabricated }) => `Hello, ${fabricated.name}`,
        ),
      }),
    ),
  );

  const result = built.fabricate({ name: "Widget" });

  expect(result.name).toBe("Widget");
  expect(result.greeting).toBe("Hello, Widget");
});

test("fabricate(overrides) uses an overridden computed field verbatim", () => {
  const { T, Fabricator } = initialize({ salt: "fabricate-compute-direct" });

  const built = new Fabricator(
    T.object({ createdAt: T.date }).refine(({ compute }) => ({
      day: compute(T.date).as(({ fabricated }) => fabricated.createdAt),
    })),
  );

  const override = new Date("2020-01-01T00:00:00.000Z");
  const result = built.fabricate({ day: override });

  expect(result.day).toEqual(override);
});

test("fabricate(overrides) throws immediately on an unknown key or a kind-violating value", () => {
  const { T, Fabricator } = initialize({ salt: "fabricate-throws" });

  const built = new Fabricator(
    T.object({ name: T.string.whereby({ length: { max: 5 } }) }),
  );

  expect(() =>
    built.fabricate({ nope: 1 } as unknown as { name: string }),
  ).toThrow();

  expect(() => built.fabricate({ name: 5 as unknown as string })).toThrow();
});

test("fabricate(overrides, { validate: false }) skips validation", () => {
  const { T, Fabricator } = initialize({ salt: "fabricate-skip-validate" });

  const built = new Fabricator(
    T.object({ name: T.string.whereby({ length: { max: 5 } }) }),
  );

  expect(() =>
    built.fabricate({ nope: 1 } as unknown as { name: string }, {
      validate: false,
    }),
  ).not.toThrow();
});
