import { initialize, registry } from "@ghostry/fabricator";
import { isPlainObject, isSchema } from "@ghostry/fabricator/internal";
import { expect, test } from "bun:test";

const { T } = initialize({ salt: "registry" });

/**
 * Every path under `node` holding a Schema, each checked to read as a distinct
 * object twice from the same parent. Holding the parent is what makes a nested
 * entry's check meaningful: `T.date.past` read twice is two `T.date` reads, and
 * would differ even if `past` were plain data.
 */
function freshSchemaPaths(node: unknown, path: string): Array<string> {
  if (!isPlainObject(node)) return [];

  return Object.keys(node).flatMap((key) => {
    const at = `${path}.${key}`;
    const value = node[key];
    const nested = freshSchemaPaths(value, at);

    if (!isSchema(value)) return nested;

    expect(node[key], at).not.toBe(node[key]);
    return [at, ...nested];
  });
}

/**
 * The walk checks whatever it finds; the expected list guards against it
 * finding nothing. A new bare kind passes without touching this list as long as
 * it is a getter too.
 */
test("every registry entry that is a Schema is a fresh object on each read", () => {
  expect(freshSchemaPaths(T, "T")).toEqual(
    expect.arrayContaining([
      "T.boolean",
      "T.date",
      "T.date.past",
      "T.date.future",
      "T.null",
      "T.number",
      "T.number.integer",
      "T.number.integer.sequence",
      "T.symbol",
      "T.undefined",
    ]),
  );
});

/**
 * Calling a builder already yields a fresh Schema, and `T.string`/`T.bigint`
 * carry no `[Meta]`, so none of them can stand as an identity.
 */
test("builders are plain properties", () => {
  expect(T.string).toBe(T.string);
  expect(T.number.integer.big).toBe(T.number.integer.big);
  expect(T.array).toBe(T.array);
  expect(T.enum).toBe(T.enum);
});

test("getters survive registry.extend", () => {
  const X = registry.extend(({ T }) => ({ extra: T.always(1) }));

  expect(X.boolean).not.toBe(X.boolean);

  const { date } = X;
  expect(date.past).not.toBe(date.past);
});

/**
 * The extension's own `positive` is plain data, so it is one object on every
 * read — the extension's choice, which the next test shows the way out of.
 *
 * `integer` is read reflectively because `DeepMerge`'s type treats a kind's
 * Schema interface as not a plain object and replaces it, while the runtime
 * merges it and keeps `integer`.
 */
test("an extension merged into a getter is merged again on every read", () => {
  const X = registry.extend(({ T }) => ({
    number: { positive: T.number.whereby({ min: 0 }) },
  }));
  const { Fabricator } = initialize({ salt: "registry-merge", types: X });

  expect(X.number).not.toBe(X.number);
  expect(X.number.positive).toBe(X.number.positive);

  const number: object = X.number;
  expect(Reflect.get(number, "integer")).toBeDefined();
  expect(Reflect.get(number, "integer")).not.toBe(
    Reflect.get(number, "integer"),
  );

  expect(new Fabricator(X.number.positive).fabricate()).toBeGreaterThanOrEqual(
    0,
  );
});

test("a getter an extension writes stays a getter, at the top and nested", () => {
  const X = registry.extend(({ T }) => ({
    get id() {
      return T.number.integer.sequence;
    },
    number: {
      get positive() {
        return T.number.whereby({ min: 0 });
      },
    },
  }));

  expect(X.id).not.toBe(X.id);

  const { number } = X;
  expect(number.positive).not.toBe(number.positive);
});
