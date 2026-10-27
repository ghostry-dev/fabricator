import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";
import { Adaptation } from "@ghostry/fabricator/adapting";

function setup(salt: string) {
  const instance = initialize({ salt, clock: "derived" });
  const { T } = instance;

  const User = T.object({
    id: T.number.integer.whereby({ min: 1, max: 1_000_000 }),
    first: T.string.whereby({ length: { min: 3, max: 8 } }),
    last: T.string.whereby({ length: { min: 3, max: 8 } }),
    email: T.string.whereby({ length: { min: 5, max: 20 } }),
  }).refine(({ compute }) => ({
    name: compute(T.string)
      .from(["first", "last"])
      .as(({ fabricated }) => `${fabricated.first} ${fabricated.last}`),
  }));

  return { ...instance, User };
}

test("pick keeps exactly the named fields, in source order", () => {
  const { T, Fabricator, User } = setup("subset-pick");

  const picked = T.pick(User, ["email", "id"]);

  expect(Object.keys(new Fabricator(picked).fabricate())).toEqual([
    "id",
    "email",
  ]);
  expect(picked[Meta].hidden).toBeUndefined();
});

test("omit drops exactly the named fields", () => {
  const { T, Fabricator, User } = setup("subset-omit");

  const omitted = T.omit(User, ["email"]);

  expect(Object.keys(new Fabricator(omitted).fabricate())).toEqual([
    "id",
    "first",
    "last",
    "name",
  ]);
  expect(omitted[Meta].hidden).toBeUndefined();
});

test("a kept field fabricates the same value it does on the source", () => {
  const a = setup("subset-parity");
  const b = setup("subset-parity");

  const full = new a.Fabricator(a.User).fabricate();
  const picked = new b.Fabricator(
    b.T.pick(b.User, ["id", "email"]),
  ).fabricate();

  expect(picked).toEqual({ id: full.id, email: full.email });
});

test("a kept compute field's dropped dependencies are fabricated hidden", () => {
  const { T, Fabricator, User } = setup("subset-hidden");

  const picked = T.pick(User, ["id", "name"]);
  const result = new Fabricator(picked).fabricate();

  expect(Object.keys(result)).toEqual(["id", "name"]);
  expect(result.name).toMatch(/^\S{3,8} \S{3,8}$/);
  expect(Object.keys(picked[Meta].hidden!).sort()).toEqual(["first", "last"]);
});

test("a hidden dependency yields the same compute value as on the source", () => {
  const a = setup("subset-hidden-parity");
  const b = setup("subset-hidden-parity");

  const full = new a.Fabricator(a.User).fabricate();
  const picked = new b.Fabricator(b.T.pick(b.User, ["name"])).fabricate();

  expect(picked).toEqual({ name: full.name });
});

test("dependencies are followed transitively, through compute fields with and without `.from`", () => {
  const { T, Fabricator } = initialize({ salt: "subset-chain" });

  const schema = T.object({ x: T.always(1), unrelated: T.always(0) })
    .refine(({ compute }) => ({
      a: compute(T.number)
        .from(["x"])
        .as(({ fabricated }) => fabricated.x + 1),
    }))
    .refine(({ compute }) => ({
      b: compute(T.number).as(({ fabricated }) => fabricated.a * 10),
    }))
    .refine(({ compute }) => ({
      c: compute(T.number)
        .from(["b"])
        .as(({ fabricated }) => fabricated.b + 5),
    }));

  const picked = T.pick(schema, ["a", "c"]);

  expect(new Fabricator(picked).fabricate()).toEqual({ a: 2, c: 25 });
  expect(Object.keys(picked[Meta].hidden!).sort()).toEqual([
    "b",
    "unrelated",
    "x",
  ]);
});

test("a compute field with a fixed value needs none of its dependencies", () => {
  const { T, Fabricator, User } = setup("subset-fixed");

  const picked = T.pick(User.override({ name: "Fixed Name" }), ["name"]);

  expect(new Fabricator(picked).fabricate()).toEqual({ name: "Fixed Name" });
  expect(picked[Meta].hidden).toBeUndefined();
});

test("a fixed field and a field's own adaptation survive", () => {
  const { T, Fabricator, User } = setup("subset-carry");

  const adapter = { key: "test/dummy" as const, convert: () => "ok" };
  const source = User.override({ id: 7 }).extend(() => ({
    tag: T.always("t").adapt(adapter, () => "tagged"),
  }));

  const picked = T.pick(source, ["id", "tag"]);

  expect(new Fabricator(picked).fabricate()).toEqual({ id: 7, tag: "t" });
  expect(picked[Meta].definition.tag[Adaptation]).toHaveProperty("test/dummy");
});

test("the source's own `.as()` and whole-object adaptation are dropped", () => {
  const { T, Fabricator, User } = setup("subset-drop");

  const adapter = { key: "test/dummy" as const, convert: () => "ok" };
  const source = User.as(() => ({
    id: 0,
    first: "x",
    last: "y",
    email: "z",
    name: "x y",
  })).adapt(adapter, () => "whole");

  const picked = T.pick(source, ["id"]);

  expect(new Fabricator(picked).fabricate().id).not.toBe(0);
  expect(picked[Meta].produce).toBeUndefined();
  expect(picked[Adaptation]).toBeUndefined();
});

test("a built Fabricator works as the source", () => {
  const { T, Fabricator, User } = setup("subset-built");

  const picked = T.omit(new Fabricator(User), ["email", "name"]);

  expect(Object.keys(new Fabricator(picked).fabricate())).toEqual([
    "id",
    "first",
    "last",
  ]);
});

test("an unknown key throws", () => {
  const { T, User } = setup("subset-unknown");

  expect(() => T.pick(User, ["nope"] as any)).toThrow(
    expect.objectContaining({
      name: "UnknownFieldError",
      field: "nope",
      operation: "pick",
    }),
  );
  expect(() => T.omit(User, ["nope"] as any)).toThrow(
    expect.objectContaining({ name: "UnknownFieldError", operation: "omit" }),
  );
});

test("hidden fields carry through a pick of a pick", () => {
  const { T, Fabricator, User } = setup("subset-nested");

  const once = T.pick(User, ["id", "name", "email"]);
  const twice = T.pick(once, ["name"]);

  expect(Object.keys(new Fabricator(twice).fabricate())).toEqual(["name"]);
  expect(Object.keys(twice[Meta].hidden!).sort()).toEqual(["first", "last"]);
});

test("dropping the compute field drops its hidden dependencies too", () => {
  const { T, User } = setup("subset-nested-drop");

  const once = T.pick(User, ["id", "name"]);

  expect(T.pick(once, ["id"])[Meta].hidden).toBeUndefined();
});

test("`.extend` with a hidden field's key makes it visible", () => {
  const { T, Fabricator, User } = setup("subset-extend");

  const picked = T.pick(User, ["name"]).extend(() => ({
    first: T.always("Ada"),
  }));
  const result = new Fabricator(picked).fabricate();

  expect(result.first).toBe("Ada");
  expect(result.name).toStartWith("Ada ");
  expect(Object.keys(picked[Meta].hidden!)).toEqual(["last"]);
});

test("a hidden field cannot be overridden", () => {
  const { T, Fabricator, User } = setup("subset-override");

  const picked = T.pick(User, ["name"]);

  expect(() => picked.override({ first: "Ada" } as any)).toThrow(
    expect.objectContaining({ name: "UnknownFieldError", available: ["name"] }),
  );

  const result = new Fabricator(picked).fabricate({ first: "Ada" } as any, {
    validate: false,
  });
  expect(result).toEqual({ name: expect.not.stringMatching(/^Ada /) });
});

test("a hidden `self` terminates like a visible one", () => {
  const { T, Fabricator } = initialize({ salt: "subset-recursive" });

  const Tree = T.recursive((self) =>
    T.pick(
      T.object({
        children: T.array(self).whereby({ length: { max: 2 } }),
      }).refine(({ compute }) => ({
        count: compute(T.number)
          .from(["children"])
          .as(({ fabricated }) => fabricated.children.length),
      })),
      ["count"],
    ),
  ).whereby({ depth: { max: 3 } });

  const result = new Fabricator(Tree).fabricate();

  expect(Object.keys(result)).toEqual(["count"]);
  expect(result.count).toBeGreaterThanOrEqual(0);
});
