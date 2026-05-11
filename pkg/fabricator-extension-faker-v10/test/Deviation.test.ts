import { en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { Kind } from "@ghostry/fabricator/internal";
import { expect, test } from "bun:test";

/**
 * The mirror's shape is deliberate, not incidental — see the deviation
 * policy in `CLAUDE.md`'s "The faker extension". These pin the three
 * departures from a straight 1:1
 * mapping of faker's own API: `helpers` dropped entirely, `color`'s 7
 * return-type-varies-by-argument methods split into named `text`/`channels`
 * builders, and a return type narrowed to a literal union where faker's own
 * declared type is one.
 */

const types = () => registry.extend(fakerExtension({ locale: en }));

const colorSplitMethods = [
  "rgb",
  "cmyk",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "colorByCSSColorSpace",
] as const;

test("helpers is absent from the mirror entirely", () => {
  const { T } = initialize({ types: types() });
  expect(T.faker).not.toHaveProperty("helpers");
});

test("each color.* split method exposes text() and channels(), and neither node itself is callable", () => {
  const { T } = initialize({ types: types() });

  for (const method of colorSplitMethods) {
    const node = (T.faker.color as unknown as Record<string, unknown>)[method];
    expect(typeof node).not.toBe("function");
    expect(typeof node).toBe("object");
    expect(typeof (node as Record<string, unknown>).text).toBe("function");
    expect(typeof (node as Record<string, unknown>).channels).toBe("function");
  }
});

test("color.rgb.text() fabricates a string; color.rgb.channels() fabricates a numeric array", () => {
  const { T, Fabricator } = initialize({ seed: "color-split", types: types() });

  const { text, channels } = new Fabricator(
    T.object({
      text: T.faker.color.rgb.text(),
      channels: T.faker.color.rgb.channels(),
    }),
  ).fabricate();

  expect(typeof text).toBe("string");
  expect(Array.isArray(channels)).toBe(true);
  expect(channels.every((c) => typeof c === "number")).toBe(true);
});

test("color's 4 non-split methods (human, space, cssSupportedFunction, cssSupportedSpace) stay ordinary builders", () => {
  const { T } = initialize({ types: types() });

  expect(typeof T.faker.color.human).toBe("function");
  expect(typeof T.faker.color.space).toBe("function");
  expect(typeof T.faker.color.cssSupportedFunction).toBe("function");
  expect(typeof T.faker.color.cssSupportedSpace).toBe("function");
});

test("person.sexType is an enum builder, not a plain string builder", () => {
  const { T } = initialize({ types: types() });
  const schema = T.faker.person.sexType();

  expect((schema as unknown as Record<symbol, unknown>)[Kind]).toBe("enum");
});

/**
 * A runtime floor on the mirror's size, deliberately *not* an exact count.
 *
 * Coverage is pinned at compile time now, per module and against faker's own
 * member lists, by `test/index.types.test.ts`'s `_ModulesExhaustive` and
 * `MethodsExhaustive<$M>` — a method added or dropped upstream fails `check`
 * at the module that moved. That is strictly stronger than a total, which
 * can only say that *some* number changed, and it fires without anything
 * needing to be regenerated first.
 *
 * What a total still buys is a check that every declared builder is really
 * reachable at runtime — the type-level guards see `FakerModules/Types.ts`
 * alone, and a builder present there but missing from `FakerModules/Build.ts`
 * is a compile error, while one lost to a bad merge in the mirror's
 * *assembly* (`Construct.ts`'s spread of `build(...)` and `use`) is not. A
 * floor catches that without turning every upstream faker addition into a
 * second place to edit.
 */
test("every declared builder is reachable at runtime", () => {
  const { T } = initialize({ types: types() });

  let count = 0;
  const walk = (node: unknown): void => {
    if (typeof node === "function") {
      count++;
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const value of Object.values(node)) walk(value);
    }
  };

  walk(T.faker);

  expect(count).toBeGreaterThanOrEqual(257);
});

/**
 * `use` shares a key space with the real faker module names — the
 * type-level guard that it can never collide with one (`test/index.types.test.ts`'s
 * `_UseIsNotAModuleName`) is the one that would actually catch a future
 * faker version adding a `use` module. This is the runtime complement: `use`
 * itself carries exactly its 6 kind-tagged forms, not a module's methods.
 */
test("use carries exactly its 6 kind-tagged escape-hatch forms, not a faker module's methods", () => {
  const { T } = initialize({ types: types() });

  expect(Object.keys(T.faker.use).sort()).toEqual([
    "bigint",
    "boolean",
    "date",
    "number",
    "opaque",
    "string",
  ]);
});
