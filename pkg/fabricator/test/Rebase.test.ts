import { expect, test } from "./index.ts";
import { initialize } from "@ghostry/fabricator";

function setup(salt: string) {
  /**
   * `"derived"`: parity tests build two instances, and a wall clock captured a
   * millisecond apart would draw differently.
   */
  const instance = initialize({ salt, clock: "derived" });
  const { T } = instance;

  /** `name` is uppercased by a later `.refine()` that reads the original. */
  const Staged = T.object({
    name: T.enum.uniform(["ada", "grace"]),
    age: T.number.integer.whereby({ min: 0, max: 99 }),
  })
    .refine(({ compute }) => ({
      greeting: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `hi ${fabricated.name}`),
    }))
    .refine(({ compute }) => ({
      name: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => fabricated.name.toUpperCase()),
    }));

  return { ...instance, Staged };
}

test("rebasing a key a `.refine()` replaced changes the input every reader sees", () => {
  const { T, Fabricator, Staged } = setup("rebase-input");

  const result = new Fabricator(
    Staged.rebase({ name: T.always("ada") }),
  ).fabricate();

  expect(result).toMatchObject({ name: "ADA", greeting: "hi ada" });
});

test("every other field keeps its draw", () => {
  const a = setup("rebase-parity");
  const b = setup("rebase-parity");

  const original = new a.Fabricator(a.Staged).fabricate();
  const rebased = new b.Fabricator(
    b.Staged.rebase({ name: b.T.always("ada") }),
  ).fabricate();

  expect(rebased.age).toBe(original.age);
});

test("rebasing a key no `.refine()` replaced is the same as extending it", () => {
  const { T, Fabricator } = initialize({ salt: "rebase-plain" });

  const User = T.object({
    first: T.enum.uniform(["ada", "grace"]),
    last: T.always("hopper"),
  }).refine(({ compute }) => ({
    name: compute(T.string)
      .from(["first", "last"])
      .as(({ fabricated }) => `${fabricated.first} ${fabricated.last}`),
  }));

  const rebased = new Fabricator(
    User.rebase({ first: T.always("ada") }),
  ).fabricate();
  const extended = new Fabricator(
    User.extend(() => ({ first: T.always("ada") })),
  ).fabricate();

  expect(rebased).toEqual({ first: "ada", last: "hopper", name: "ada hopper" });
  expect(extended).toEqual(rebased);
});

test("rebasing a key a `.refine()` introduced replaces that compute field", () => {
  const { T, Fabricator } = initialize({ salt: "rebase-computed" });

  const schema = T.object({ a: T.always(1) })
    .refine(({ compute }) => ({
      b: compute(T.number)
        .from(["a"])
        .as(({ fabricated }) => fabricated.a + 1),
    }))
    .refine(({ compute }) => ({
      c: compute(T.number)
        .from(["b"])
        .as(({ fabricated }) => fabricated.b * 10),
    }));

  expect(new Fabricator(schema.rebase({ b: T.always(5) })).fabricate()).toEqual(
    { a: 1, b: 5, c: 50 },
  );
});

test("a key replaced twice runs both refines over the rebased input", () => {
  const { T, Fabricator } = initialize({ salt: "rebase-twice" });

  const schema = T.object({ name: T.enum.uniform(["ada", "grace"]) })
    .refine(({ compute }) => ({
      name: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => fabricated.name.toUpperCase()),
    }))
    .refine(({ compute }) => ({
      name: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `${fabricated.name}!`),
    }));

  expect(
    new Fabricator(schema.rebase({ name: T.always("ada") })).fabricate(),
  ).toEqual({ name: "ADA!" });
});

test("a rebase replaces an earlier `.override()` of the original", () => {
  const { T, Fabricator } = initialize({ salt: "rebase-fixed" });

  const schema = T.object({ name: T.enum.uniform(["ada", "grace"]) })
    .override({ name: "grace" })
    .refine(({ compute }) => ({
      name: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => fabricated.name.toUpperCase()),
    }));

  expect(
    new Fabricator(schema.rebase({ name: T.always("ada") })).fabricate(),
  ).toEqual({ name: "ADA" });
});

test("an `.override()` after a rebase pins the output, and earlier readers keep the rebased input", () => {
  const { T, Fabricator, Staged } = setup("rebase-then-override");

  const schema = Staged.rebase({ name: T.always("ada") }).override({
    name: "X",
  });

  expect(new Fabricator(schema).fabricate()).toMatchObject({
    name: "X",
    greeting: "hi ada",
  });
});

test("a rebased version hidden by `T.pick` is still what its readers read", () => {
  const { T, Fabricator, Staged } = setup("rebase-hidden");

  const picked = T.pick(Staged.rebase({ name: T.always("ada") }), ["greeting"]);

  expect(new Fabricator(picked).fabricate()).toEqual({ greeting: "hi ada" });
});

test("a rebase naming an unknown field throws", () => {
  const { T, Staged } = setup("rebase-unknown");

  expect(() => Staged.rebase({ nope: T.always(1) } as any)).toThrow(
    expect.objectContaining({
      name: "@ghostry/fabricator:UnknownFieldError",
      field: "nope",
      operation: "rebase",
    }),
  );
});

test("a rebase reaches a field `T.pick` hid, since a kept field reads it", () => {
  const { T, Fabricator, Staged } = setup("rebase-hidden-key");

  const picked = T.pick(Staged, ["greeting"]).rebase({ name: T.always("ada") });

  expect(new Fabricator(picked).fabricate()).toEqual({ greeting: "hi ada" });
});

test("an unknown field's error lists hidden fields as rebasable too", () => {
  const { T, Staged } = setup("rebase-hidden-unknown");

  const picked = T.pick(Staged, ["greeting"]);

  expect(() => picked.rebase({ nope: T.always(1) } as any)).toThrow(
    expect.objectContaining({
      name: "@ghostry/fabricator:UnknownFieldError",
      field: "nope",
      available: ["greeting", "name"],
      operation: "rebase",
    }),
  );
});

test("a rebase cannot place a compute field", () => {
  const { Staged } = setup("rebase-compute");

  expect(() =>
    Staged.extend(({ base }) => {
      Staged.rebase({ age: base.greeting } as any);
      return {};
    }),
  ).toThrow(
    expect.objectContaining({
      name: "@ghostry/fabricator:ComputeOutsideRefineError",
      field: "age",
      operation: "rebase",
    }),
  );
});
