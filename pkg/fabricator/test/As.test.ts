import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";

test("`.as(f1).as(f2)` keeps fabricating with the last producer, for every non-`always` primitive", () => {
  const { T, Fabricator } = initialize({ seed: "as-chaining" });

  const cases: ReadonlyArray<[string, any, any]> = [
    ["bigint", T.bigint, BigInt(2)],
    ["boolean", T.boolean, true],
    ["date", T.date, new Date(2020, 0, 1)],
    ["number", T.number, 2],
    ["string", T.string, "second"],
    ["symbol", T.symbol, undefined],
    ["array", T.array(T.number), [1, 2, 3]],
    ["tuple", T.tuple([T.number, T.number]), [1, 2]],
    ["object", T.object({ x: T.number }), { x: 2 }],
  ];

  for (const [kind, schema, second] of cases) {
    const first = kind === "symbol" ? Symbol("first") : (undefined as any);
    const secondValue = kind === "symbol" ? Symbol("second") : second;

    const chained = schema.as(() => first).as(() => secondValue);
    const built = new Fabricator(chained).fabricate();

    if (kind === "symbol") {
      expect(built).toBe(secondValue);
    } else {
      expect(built).toEqual(secondValue);
    }
  }
});

test("`.as(produce)` seeds `produce` with this leaf's own stream, replaying identically across two builds sharing a seed", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "as-seeded",
      clock: "seeded",
    });

    return {
      bool: new Fabricator(T.boolean.as(({ random }) => random.next() < 0.5)),
      num: new Fabricator(T.number.as(({ random }) => random.next() * 100)),
      str: new Fabricator(
        T.string
          .whereby({ length: { max: 5 } })
          .as(({ random }) => random.next().toString(36)),
      ),
      obj: new Fabricator(
        T.object({ x: T.number }).as(({ random }) => ({ x: random.next() })),
      ),
    };
  };

  const a = build();
  const b = build();

  expect(a.bool.fabricate()).toBe(b.bool.fabricate());
  expect(a.num.fabricate()).toBe(b.num.fabricate());
  expect(a.str.fabricate()).toBe(b.str.fabricate());
  expect(a.obj.fabricate()).toEqual(b.obj.fabricate());
});

test("a zero-argument `.as(() => ...)` producer still compiles and runs unchanged", () => {
  const { T, Fabricator } = initialize({ seed: "as-zero-arg" });

  const built = new Fabricator(T.boolean.as(() => true));
  expect(built.fabricate()).toBe(true);
});

test("`.as(...)` preserves prior scoping metadata instead of discarding it", () => {
  const { T } = initialize({ seed: "as-metadata" });

  const past = T.date.past.as(() => new Date(0));
  expect(past[Meta]).toMatchObject({ mode: "past" });

  const ranged = T.bigint.whereby({ max: BigInt(10) }).as(() => BigInt(5));
  expect(ranged[Meta]).toMatchObject({
    whereby: {
      min: { value: -BigInt(10), exclusive: false },
      max: { value: BigInt(10), exclusive: false },
    },
  });

  const arr = T.array(T.number)
    .whereby({ length: { max: 3 } })
    .as(() => [1, 2, 3]);
  expect(arr[Meta]).toMatchObject({
    whereby: {
      length: {
        min: { value: 0, exclusive: false },
        max: { value: 3, exclusive: false },
      },
    },
  });

  const tup = T.tuple([T.number, T.string.whereby({ length: { max: 5 } })]).as(
    () => [1, "x"],
  );
  expect(tup[Meta].items).toHaveLength(2);

  const obj = T.object({ x: T.number }).as(() => ({ x: 1 }));
  expect(obj[Meta].definition).toBeDefined();
});

test("a built Fabricator's `.schema.as(...)` is genuinely usable, not just type-checkable", () => {
  const { T, Fabricator } = initialize({ seed: "as-schema-rehydrate" });

  const built = new Fabricator(
    T.date.whereby({ min: new Date(0), max: new Date(1) }),
  );
  const overridden = built.schema.as(() => new Date(2020, 0, 1));
  const fabricated = new Fabricator(overridden).fabricate();

  expect(fabricated).toEqual(new Date(2020, 0, 1));
});

test("`object`: `.extend()`/`.refine()`/`.override()` after `.as(...)` fall back to definition-based fabrication", () => {
  const { T, Fabricator } = initialize({ seed: "as-object-reset" });

  const produced = T.object({ x: T.number }).as(() => ({ x: 999 }));

  const extended = produced.extend(() => ({ y: T.always(1) }));
  const extendedResult = new Fabricator(extended).fabricate();
  expect(extendedResult.x).not.toBe(999);
  expect(extendedResult.y).toBe(1);

  const overridden = produced.override({ x: 42 });
  const overriddenResult = new Fabricator(overridden).fabricate();
  expect(overriddenResult.x).toBe(42);
});

test("`object`: `.fabricate(overrides)` on a produce-based schema applies overrides on top of `produce()`'s result", () => {
  const { T, Fabricator } = initialize({ seed: "as-object-overrides" });

  const schema = T.object({ x: T.number, y: T.number }).as(() => ({
    x: 1,
    y: 2,
  }));

  const fabricator = new Fabricator(schema);

  expect(fabricator.fabricate()).toEqual({ x: 1, y: 2 });
  expect(fabricator.fabricate({ x: 100 })).toEqual({ x: 100, y: 2 });
  expect(() => fabricator.fabricate({ unknown: 1 } as any)).toThrow();
});
