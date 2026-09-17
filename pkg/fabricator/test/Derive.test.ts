import { expect, test } from "bun:test";
import { FabricatorError, initialize } from "@ghostry/fabricator";
import { Children } from "@ghostry/fabricator/internal";

test("joining fabricated parts produces the derived value", () => {
  const { T, Fabricator } = initialize({ salt: "derive-join" });

  const built = new Fabricator(
    T.derive({
      to: T.string,
      from: [T.always("hello"), T.string.as(() => "world")],
    }).as((parts) => parts.join(":")),
  );

  expect(built.fabricate()).toBe("hello:world");
});

test("mixed from kinds flow into a template string", () => {
  const { T, Fabricator } = initialize({ salt: "derive-mixed" });

  const built = new Fabricator(
    T.derive({
      to: T.string,
      from: [T.always("n"), T.number.integer.whereby({ min: 1, max: 3 })],
    }).as(([label, n]) => `${label}:${n}`),
  );

  const result = built.fabricate();
  expect(result).toMatch(/^n:[123]$/);
});

test("a derive nested in an object fabricates as a field", () => {
  const { T, Fabricator } = initialize({ salt: "derive-in-object" });

  const built = new Fabricator(
    T.object({
      sku: T.derive({
        to: T.string,
        from: [T.always("SKU"), T.number.integer.whereby({ min: 1, max: 9 })],
      }).as(([prefix, n]) => `${prefix}-${n}`),
    }),
  );

  expect(built.fabricate().sku).toMatch(/^SKU-[1-9]$/);
});

test("a derive nested in an array fabricates independently per element", () => {
  const { T, Fabricator } = initialize({ salt: "derive-in-array" });

  const built = new Fabricator(
    T.array(
      T.derive({ to: T.string, from: [T.always("x"), T.number] }).as(
        ([prefix, n]) => `${prefix}:${n}`,
      ),
    ).whereby({ length: { min: 20, max: 30 } }),
  );

  const results = built.fabricate();
  const suffixes = new Set(results.map((r) => r.slice("x:".length)));

  expect(results.every((r) => r.startsWith("x:"))).toBe(true);
  expect(suffixes.size).toBeGreaterThan(1);
});

test("the same salt reproduces the identical derive, including a random draw inside resolve", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      salt: "derive-repro",
      clock: "derived",
    });
    return new Fabricator(
      T.derive({ to: T.number, from: [T.number] }).as(
        ([n], { random }) => n + random.next(),
      ),
    ).fabricate();
  };

  expect(build()).toBe(build());
});

test("a resolver returning a value that violates its to schema throws DeriveResultMismatchError", () => {
  const { T, Fabricator } = initialize({ salt: "derive-mismatch" });

  const schema = T.derive({ to: T.string, from: [T.always("hello")] }).as(
    () => 1 as unknown as string,
  );

  expect(() => new Fabricator(schema).fabricate()).toThrow(
    FabricatorError.DeriveResultMismatchError,
  );
});

test("to may be a bare builder or a configured schema", () => {
  const { T, Fabricator } = initialize({ salt: "derive-to-shapes" });

  const fromBuilder = new Fabricator(
    T.derive({ to: T.string, from: [T.always("x")] }).as(([value]) => value),
  );

  const fromSchema = new Fabricator(
    T.derive({
      to: T.string.whereby({ length: { max: 5 } }),
      from: [T.always("y")],
    }).as(([value]) => value),
  );

  expect(fromBuilder.fabricate()).toBe("x");
  expect(fromSchema.fabricate()).toBe("y");
});

test(".adapt(...) is additive to fabrication", () => {
  const { T, Fabricator } = initialize({ salt: "derive-adapt" });

  const adapter = { key: "test/dummy" as const, convert: () => "ok" };

  const schema = T.derive({ to: T.string, from: [T.always("hello")] })
    .as(([value]) => value)
    .adapt(adapter, () => "ok");

  expect(new Fabricator(schema).fabricate()).toBe("hello");
});

test("a derive inside T.recursive whose from contains self terminates", () => {
  const { T, Fabricator } = initialize({ salt: "derive-recursive" });

  const Tree = T.recursive((self) =>
    T.object({
      size: T.derive({
        to: T.number,
        from: [T.array(self).whereby({ length: { max: 2 } })],
      }).as(([children]) => children.length),
    }),
  ).whereby({ depth: { max: 2 } });

  const built = new Fabricator(Tree);
  for (let i = 0; i < 20; i++) {
    const node = built.fabricate();
    expect(typeof node.size).toBe("number");
    expect(node.size).toBeGreaterThanOrEqual(0);
    expect(node.size).toBeLessThanOrEqual(2);
  }
});

test("a built derive carries [Children] for each from slot", () => {
  const { T, Fabricator } = initialize({ salt: "derive-children" });

  const built = new Fabricator(
    T.derive({ to: T.string, from: [T.always("hello"), T.always("world")] }).as(
      (parts) => parts.join(":"),
    ),
  );

  expect(built[Children]).toHaveLength(2);
});

test("overriding a derive field checks the value against its to kind", () => {
  const { T } = initialize({ salt: "derive-override" });

  const derived = T.derive({ to: T.string, from: [T.always("a")] }).as(
    ([value]) => value,
  );
  const schema = T.object({ sku: derived, maybe: T.nullable(derived) });

  expect(() => schema.override({ sku: 1 as unknown as string })).toThrow(
    FabricatorError.InvalidOverrideValueError,
  );
  expect(() => schema.override({ maybe: 1 as unknown as string })).toThrow(
    FabricatorError.InvalidOverrideValueError,
  );
  expect(schema.override({ sku: "b", maybe: null })).toBeDefined();
});

test("a to that is itself a derive checks against that derive's to kind", () => {
  const { T, Fabricator } = initialize({ salt: "derive-nested-to" });

  const inner = T.derive({ to: T.string, from: [T.always("a")] }).as(
    ([value]) => value,
  );
  const schema = T.derive({ to: inner, from: [T.always(1)] }).as(
    ([n]) => n as unknown as string,
  );

  expect(() => new Fabricator(schema).fabricate()).toThrow(
    FabricatorError.DeriveResultMismatchError,
  );
});

test("combinatorial enumerates every enumerable from slot through resolve", () => {
  const { T, combinatorial } = initialize({ salt: "derive-combinatorial" });

  const results = [
    ...combinatorial(
      T.derive({
        to: T.string,
        from: [T.enum.uniform(["a", "b", "c"]), T.boolean],
      }).as(([letter, flag]) => `${letter}:${flag}`),
    ),
  ];

  expect(new Set(results)).toEqual(
    new Set(["a:true", "a:false", "b:true", "b:false", "c:true", "c:false"]),
  );
});

test("coverage reaches every option of a from slot, including inside an object", () => {
  const { T, coverage } = initialize({ salt: "derive-coverage" });

  const results = [
    ...coverage(
      T.object({
        label: T.derive({ to: T.string, from: [T.boolean] }).as(([flag]) =>
          String(flag),
        ),
      }),
    ),
  ];

  expect(new Set(results.map((r) => r.label))).toEqual(
    new Set(["true", "false"]),
  );
});

test("a to containing self does not make a recursive body unterminable", () => {
  const { T, Fabricator } = initialize({ salt: "derive-recursive-to" });

  const Tree = T.recursive((self) =>
    T.object({
      children: T.array(self).whereby({ length: { max: 2 } }),
      echo: T.derive({
        to: T.array(self).whereby({ length: { max: 1 } }),
        from: [],
      }).as(() => []),
    }),
  ).whereby({ depth: { max: 2 } });

  const built = new Fabricator(Tree);
  for (let i = 0; i < 10; i++) {
    expect(built.fabricate().echo).toEqual([]);
  }
});
