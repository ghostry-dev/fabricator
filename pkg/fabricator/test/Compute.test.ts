import { expect, test } from "./index.ts";
import { FabricatorError, initialize } from "@ghostry/fabricator";
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
      name: "@ghostry/fabricator:UnknownFieldError",
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

test("compute fields resolve in stage order, each after the ones it reads", () => {
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

  expect(new Fabricator(staged).fabricate()).toEqual({ a: 1, b: 2, c: 3 });
});

test("a later `.refine()` replacing a field an earlier compute field reads leaves that reader on the original", () => {
  const { T, Fabricator } = initialize({ salt: "compute-stages" });

  const schema = T.object({ y: T.always(1) })
    .refine(({ compute }) => ({
      x: compute(T.number)
        .from(["y"])
        .as(({ fabricated }) => fabricated.y + 1),
    }))
    /** Reads `x`, which read the original `y`: no cycle. */
    .refine(({ compute }) => ({
      y: compute(T.number)
        .from(["x"])
        .as(({ fabricated }) => fabricated.x * 10),
    }));

  expect(new Fabricator(schema).fabricate()).toEqual({ y: 20, x: 2 });
});

test("a fixed compute field reads nothing", () => {
  const { T, Fabricator } = initialize({ salt: "compute-fixed" });

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

test("a compute field cannot be placed by `T.object` or `.extend`", () => {
  const { T } = initialize({ salt: "compute-outside-refine" });

  const staged = T.object({ a: T.always(1) }).refine(({ compute }) => ({
    b: compute(T.number)
      .from(["a"])
      .as(({ fabricated }) => fabricated.a + 1),
  }));
  const b = staged[Meta].definition.b;

  expect(() => T.object({ b } as any)).toThrow(
    expect.objectContaining({
      name: "@ghostry/fabricator:ComputeOutsideRefineError",
      field: "b",
      operation: "object",
    }),
  );
  expect(() => staged.extend(({ base }) => ({ alias: base.b }) as any)).toThrow(
    expect.objectContaining({
      name: "@ghostry/fabricator:ComputeOutsideRefineError",
      field: "alias",
      operation: "extend",
    }),
  );
});

test("a compute field anywhere but an object's own field throws when built", () => {
  const { T, Fabricator } = initialize({ salt: "compute-detached" });

  const staged = T.object({ a: T.always(1) }).refine(({ compute }) => ({
    b: compute(T.number).as(({ fabricated }) => fabricated.a + 1),
  }));
  const b = staged[Meta].definition.b;

  expect(
    () => new Fabricator(T.array(b as any).whereby({ length: 1 })),
  ).toThrow(FabricatorError.DetachedComputeError);
});

test("`.extend` replacing a field a compute field reads changes what it reads", () => {
  const { T, Fabricator } = initialize({ salt: "compute-extend" });

  /** `T.enum`, so `"grace"` fits the type `greeting` reads `name` as. */
  const schema = T.object({ name: T.enum.uniform(["ada", "grace"]) })
    .refine(({ compute }) => ({
      greeting: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `hi ${fabricated.name}`),
    }))
    .extend(() => ({ name: T.always("grace") }));

  expect(new Fabricator(schema).fabricate()).toEqual({
    name: "grace",
    greeting: "hi grace",
  });
});

test("`.extend` after a `.refine()` replaced a field changes only its current version", () => {
  const { T, Fabricator } = initialize({ salt: "compute-extend-stages" });

  const schema = T.object({ name: T.always("ada") })
    .refine(({ compute }) => ({
      greeting: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `hi ${fabricated.name}`),
    }))
    .refine(({ compute }) => ({
      name: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => fabricated.name.toUpperCase()),
    }))
    .refine(({ compute }) => ({
      shout: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `${fabricated.name}!`),
    }))
    .extend(() => ({ name: T.always("GRACE") }));

  expect(new Fabricator(schema).fabricate()).toEqual({
    name: "GRACE",
    greeting: "hi ada",
    shout: "GRACE!",
  });
});
test("a compute field replacing its own key reads that field's original draw", () => {
  const plain = initialize({ salt: "compute-replace" });
  const refined = initialize({ salt: "compute-replace" });

  const shape = (T: typeof plain.T) =>
    T.object({
      name: T.enum.uniform(["ada", "grace", "edsger"]),
      age: T.number.integer.whereby({ min: 0, max: 99 }),
    });

  const schema = shape(refined.T).refine(({ compute }) => ({
    name: compute(refined.T.string).as(({ fabricated }) =>
      fabricated.name.toUpperCase(),
    ),
  }));

  const before = new plain.Fabricator(shape(plain.T));
  const after = new refined.Fabricator(schema);

  for (let i = 0; i < 20; i++) {
    const original = before.fabricate();
    expect(after.fabricate()).toEqual({
      name: original.name.toUpperCase(),
      age: original.age,
    });
  }
});

test("a `.from` naming its own replaced key is handed only the original", () => {
  const { T, Fabricator } = initialize({ salt: "compute-replace-from" });

  let seen: unknown;
  const schema = T.object({ name: T.always("ada"), age: T.always(36) }).refine(
    ({ compute }) => ({
      name: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => {
          seen = fabricated;
          return fabricated.name.toUpperCase();
        }),
    }),
  );

  expect(new Fabricator(schema).fabricate()).toEqual({ name: "ADA", age: 36 });
  expect(seen).toEqual({ name: "ada" });
});

test("a key replaced twice hands the second resolver the first one's value", () => {
  const { T, Fabricator } = initialize({ salt: "compute-replace-twice" });

  const schema = T.object({ name: T.always("ada") })
    .refine(({ compute }) => ({
      name: compute(T.string).as(({ fabricated }) =>
        fabricated.name.toUpperCase(),
      ),
    }))
    .refine(({ compute }) => ({
      name: compute(T.string).as(({ fabricated }) => `${fabricated.name}!`),
    }));

  expect(new Fabricator(schema).fabricate()).toEqual({ name: "ADA!" });
});

test("replacing an overridden field reads the overridden value", () => {
  const { T, Fabricator } = initialize({ salt: "compute-replace-fixed" });

  const schema = T.object({ name: T.enum.uniform(["ada", "grace"]) })
    .override({ name: "grace" })
    .refine(({ compute }) => ({
      name: compute(T.string).as(({ fabricated }) =>
        fabricated.name.toUpperCase(),
      ),
    }));

  expect(new Fabricator(schema).fabricate()).toEqual({ name: "GRACE" });
});

test("replacing an omitted field leaves its key absent from the resolver's input", () => {
  const { T, Fabricator } = initialize({ salt: "compute-replace-omitted" });

  const schema = T.object({
    nickname: T.omittable(T.always("Ace")).weighted({ value: 0 }),
  }).refine(({ compute }) => ({
    nickname: compute(T.string).as(({ fabricated }) =>
      "nickname" in fabricated ? "present" : "absent",
    ),
  }));

  expect(new Fabricator(schema).fabricate()).toEqual({ nickname: "absent" });
});

test("a `.refine()` replacing a key leaves earlier readers on the original and later ones on the new value", () => {
  const { T, Fabricator } = initialize({ salt: "compute-replace-readers" });

  const schema = T.object({ name: T.always("ada") })
    .refine(({ compute }) => ({
      greeting: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `hi ${fabricated.name}`),
    }))
    /**
     * A plain `.as`, so it reads `greeting` too: `greeting` read the original
     * `name`, so that is no cycle.
     */
    .refine(({ compute }) => ({
      name: compute(T.string).as(
        ({ fabricated }) =>
          `${fabricated.name.toUpperCase()} (${fabricated.greeting})`,
      ),
    }))
    .refine(({ compute }) => ({
      shout: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `${fabricated.name}!`),
    }));

  expect(new Fabricator(schema).fabricate()).toEqual({
    name: "ADA (hi ada)",
    greeting: "hi ada",
    shout: "ADA (hi ada)!",
  });
});
test("`T.pick`/`T.omit` keep a replaced field's original fabricated", () => {
  const { T, Fabricator } = initialize({ salt: "compute-replace-subset" });

  const schema = T.object({ name: T.always("ada"), age: T.always(36) })
    .refine(({ compute }) => ({
      name: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => fabricated.name.toUpperCase()),
    }))
    .refine(({ compute }) => ({
      greeting: compute(T.string)
        .from(["name"])
        .as(({ fabricated }) => `hi ${fabricated.name}`),
    }));

  expect(new Fabricator(T.omit(schema, ["age"])).fabricate()).toEqual({
    name: "ADA",
    greeting: "hi ADA",
  });
  expect(new Fabricator(T.pick(schema, ["greeting"])).fabricate()).toEqual({
    greeting: "hi ADA",
  });
});

test("a per-call override of a replaced key skips its resolver", () => {
  const { T, Fabricator } = initialize({ salt: "compute-replace-override" });

  let calls = 0;
  const schema = T.object({ name: T.always("ada") }).refine(({ compute }) => ({
    name: compute(T.string).as(({ fabricated }) => {
      calls++;
      return fabricated.name.toUpperCase();
    }),
  }));

  expect(new Fabricator(schema).fabricate({ name: "bob" })).toEqual({
    name: "bob",
  });
  expect(calls).toBe(0);
});
