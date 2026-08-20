import { en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { expect, test } from "bun:test";

/**
 * The structural invariant every node of the mirror upholds: a plain object
 * (walkable, mergeable) or a function with no own enumerable properties (a
 * leaf, nothing to walk into). `registry.extend`'s `deepMerge` only recurses
 * where `isPlainObject` holds on both sides — a callable-with-properties would
 * silently swallow any `.extend()` aimed at it, since `deepMerge` would treat
 * it as an opaque leaf and replace it wholesale instead of merging into it.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null
    && typeof value === "object"
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)
  );
}

test("every node of the mirror is a plain object or a function with no own enumerable properties", () => {
  const { T } = initialize({
    types: registry.extend(fakerExtension({ locale: en })),
  });

  const offenders: string[] = [];

  const walk = (node: unknown, path: string): void => {
    if (typeof node === "function") {
      const ownKeys = Object.keys(node);
      if (ownKeys.length > 0) offenders.push(`${path} (keys: ${ownKeys})`);
      return;
    }
    if (isPlainObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        walk(value, `${path}.${key}`);
      }
      return;
    }
    offenders.push(
      `${path} (neither plain object nor function: ${typeof node})`,
    );
  };

  walk(T.faker, "T.faker");

  expect(offenders).toEqual([]);
});

test(".extend() into T.faker.color.rgb survives, and the existing rgb entries are untouched", () => {
  const base = registry.extend(fakerExtension({ locale: en }));

  const extended = base.extend(({ T }) => ({
    faker: { color: { rgb: { hex: T.faker.color.rgb.text } } },
  }));

  const { T } = initialize({ types: extended });

  expect(typeof T.faker.color.rgb.text).toBe("function");
  expect(typeof T.faker.color.rgb.channels).toBe("function");
  expect(typeof (T.faker.color.rgb as unknown as { hex: unknown }).hex).toBe(
    "function",
  );
});
