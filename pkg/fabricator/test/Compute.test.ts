import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";

test("a computed field's resolver returning a value matching its source's kind fabricates normally", () => {
  const { T, Fabricator } = initialize({ salt: "compute-valid" });

  const schema = T.object({ createdAt: T.date }).refine(({ compute }) => ({
    day: compute(T.date).as(({ fabricated }) => fabricated.createdAt),
  }));

  const result = new Fabricator(schema).fabricate();

  expect(result.day).toEqual(result.createdAt);
});

test("a computed field's resolver returning a value that violates its source's declared kind throws at fabricate() time", () => {
  const { T, Fabricator } = initialize({ salt: "compute-invalid" });

  const schema = T.object({ createdAt: T.date }).refine(({ compute }) => ({
    // A bug: declares a `date` source but the resolver actually returns a
    // string — TS's `Resolved<$Source>` would normally catch this at the
    // call site, but the cast bypasses it, so this must be caught at
    // runtime instead.
    day: compute(T.date).as(() => "not-a-date" as unknown as Date),
  }));

  expect(() => new Fabricator(schema).fabricate()).toThrow();
});

test("a `.from` resolver is handed only the fields it names", () => {
  const { T, Fabricator } = initialize({ salt: "compute-from" });

  let seen: string[] = [];
  const schema = T.object({
    first: T.always("Ada"),
    last: T.always("Lovelace"),
    email: T.always("ada@example.com"),
  }).refine(({ compute }) => ({
    name: compute(T.string)
      .from(["first", "last"])
      .as(({ fabricated }) => {
        seen = Object.keys(fabricated);
        return `${fabricated.first} ${fabricated.last}`;
      }),
  }));

  const result = new Fabricator(schema).fabricate();

  expect(result.name).toBe("Ada Lovelace");
  expect(seen).toEqual(["first", "last"]);
});

test("an omitted `.from` dependency is absent, not `undefined`", () => {
  const { T, Fabricator } = initialize({ salt: "compute-from-omitted" });

  const schema = T.object({
    nickname: T.omittable(T.always("Ace")).weighted({ value: 0 }),
  }).refine(({ compute }) => ({
    hasNickname: compute(T.boolean)
      .from(["nickname"])
      .as(({ fabricated }) => "nickname" in fabricated),
  }));

  expect(new Fabricator(schema).fabricate().hasNickname).toBe(false);
});

test("a `.from` key outside the refine stage's base throws", () => {
  const { T } = initialize({ salt: "compute-from-unknown" });

  const base = T.object({ a: T.always(1) });

  expect(() =>
    base.refine(({ compute }) => ({
      b: compute(T.number)
        .from(["nope"] as any)
        .as(() => 2),
    })),
  ).toThrow(
    expect.objectContaining({
      name: "UnknownFieldError",
      field: "nope",
      available: ["a"],
      operation: "compute from",
    }),
  );
});

test("a compute field without `.from` still sees the whole object", () => {
  const { T, Fabricator } = initialize({ salt: "compute-whole" });

  let seen: string[] = [];
  const schema = T.object({ a: T.always(1), b: T.always(2) }).refine(
    ({ compute }) => ({
      sum: compute(T.number).as(({ fabricated }) => {
        seen = Object.keys(fabricated);
        return fabricated.a + fabricated.b;
      }),
    }),
  );

  expect(new Fabricator(schema).fabricate().sum).toBe(3);
  expect(seen).toEqual(["a", "b"]);
});

test("compute fields resolve after the compute fields they depend on, wherever they sit", () => {
  const { T, Fabricator } = initialize({ salt: "compute-order" });

  const staged = T.object({ a: T.always(1) })
    .refine(({ compute }) => ({
      b: compute(T.number)
        .from(["a"])
        .as(({ fabricated }) => fabricated.a + 1),
    }))
    .refine(({ compute }) => ({
      c: compute(T.number)
        .from(["b"])
        .as(({ fabricated }) => fabricated.b + 1),
    }));

  /** Lists `c` before `b`: order comes from dependencies, not position. */
  const reordered = T.object({ a: T.always(1) }).extend(() => ({
    c: staged[Meta].definition.c,
    b: staged[Meta].definition.b,
  }));

  expect(new Fabricator(staged).fabricate()).toEqual({ a: 1, b: 2, c: 3 });
  expect(new Fabricator(reordered).fabricate()).toMatchObject({ b: 2, c: 3 });
});

test("a later `.refine()` that closes a dependency cycle throws while building the schema", () => {
  const { T } = initialize({ salt: "compute-cycle" });

  const schema = T.object({ y: T.always(1) }).refine(({ compute }) => ({
    x: compute(T.number)
      .from(["y"])
      .as(({ fabricated }) => fabricated.y),
  }));

  /** Replaces plain `y` with a compute field reading `x`, which reads `y`. */
  expect(() =>
    schema.refine(({ compute }) => ({
      y: compute(T.number)
        .from(["x"])
        .as(({ fabricated }) => fabricated.x),
    })),
  ).toThrow(
    expect.objectContaining({
      name: "ComputeDependencyCycleError",
      fields: ["y", "x", "y"],
    }),
  );
});

test("a fixed compute field does not count toward a cycle", () => {
  const { T, Fabricator } = initialize({ salt: "compute-cycle-fixed" });

  const schema = T.object({ y: T.always(1) })
    .refine(({ compute }) => ({
      x: compute(T.number)
        .from(["y"])
        .as(({ fabricated }) => fabricated.y),
    }))
    .override({ x: 5 })
    .refine(({ compute }) => ({
      y: compute(T.number)
        .from(["x"])
        .as(({ fabricated }) => fabricated.x * 2),
    }));

  expect(new Fabricator(schema).fabricate()).toEqual({ y: 10, x: 5 });
});
