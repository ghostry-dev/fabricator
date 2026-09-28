import { beforeAll, expect, test } from "bun:test";
import { classes, initialize } from "@ghostry/fabricator";
import { census, suggest, type Suggestion } from "@ghostry/fabricator-census";

/**
 * Fabricate from a schema whose every probability is known, take a census of
 * the result, and check each suggestion recovers what the schema said. The
 * schema covers every wrapper, an enum, a skewed integer, a distributed
 * non-ASCII string, an array, a record, a sequence and a derived ISO string.
 */
const COUNT = 5000;
let root: Suggestion;

beforeAll(() => {
  const { T, Fabricator } = initialize({
    salt: "roundtrip",
    clock: new Date(0),
  });
  const word = T.string.whereby({
    length: { min: 3, max: 12 },
    composition: { lowercase: 1 },
  });
  const schema = T.object({
    id: T.number.integer.sequence,
    nickname: T.omittable(word).weighted({ omitted: 1, value: 3 }),
    note: T.optional(word).weighted({ omitted: 1, undefined: 1, value: 2 }),
    manager: T.nullable(
      T.number.integer.whereby({ min: 1, max: 500 }),
    ).weighted({ null: 1, value: 4 }),
    middle: T.omittable(
      T.nullable(word).weighted({ null: 1, value: 1 }),
    ).weighted({ omitted: 1, value: 1 }),
    status: T.enum.weighted([
      [6, "active"],
      [3, "pending"],
      [1, "banned"],
    ]),
    score: T.number.integer.whereby({
      min: 0,
      max: 100,
      distribution: { kind: "skew", exponent: 2 },
    }),
    name: T.string.whereby({
      length: {
        min: 2,
        max: 20,
        distribution: { kind: "normal", mean: 8, spread: 3 },
      },
      composition: [
        [8, classes.lowercase],
        [1, { from: 0xe0, to: 0xff }],
      ],
    }),
    tags: T.array(T.enum.uniform(["a", "b", "c"])).whereby({
      length: { min: 0, max: 5 },
    }),
    prefs: T.record(
      T.string.whereby({ length: 8, composition: { lowercase: 1 } }),
      T.boolean,
    ).whereby({ size: { max: 3 } }),
    born: T.derive({
      to: T.string,
      from: [
        T.date.whereby({
          min: new Date("1950-01-01"),
          max: new Date("2005-01-01"),
        }),
      ],
    }).as(([d]) => d.toISOString()),
  });
  const built = new Fabricator(schema);
  const rows = Array.from({ length: COUNT }, () => built.fabricate());
  root = suggest(census.from(rows, { seed: "roundtrip" }));
});

function field(key: string): Suggestion {
  if (root.kind !== "object") throw new Error(root.kind);
  return root.fields.find((f) => f.key === key)!.value;
}

/** A weight as a share of the whole, for comparing against the schema's. */
function share(weights: Record<string, number>, outcome: string): number {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return weights[outcome]! / total;
}

test("a sequence comes back as T.number.integer.sequence", () => {
  expect(field("id").kind).toBe("sequence");
});

test("omittable recovers its weights", () => {
  const nickname = field("nickname");
  if (nickname.kind !== "omittable") throw new Error(nickname.kind);
  expect(share(nickname.weights, "omitted")).toBeCloseTo(0.25, 1);
  expect(nickname.inner.kind).toBe("string");
});

test("optional recovers all three weights", () => {
  const note = field("note");
  if (note.kind !== "optional") throw new Error(note.kind);
  expect(share(note.weights, "omitted")).toBeCloseTo(0.25, 1);
  expect(share(note.weights, "undefined")).toBeCloseTo(0.25, 1);
  expect(share(note.weights, "value")).toBeCloseTo(0.5, 1);
});

test("nullable recovers its weights and inner range", () => {
  const manager = field("manager");
  if (manager.kind !== "nullable") throw new Error(manager.kind);
  expect(share(manager.weights, "null")).toBeCloseTo(0.2, 1);
  expect(manager.inner).toMatchObject({
    kind: "number",
    integer: true,
    whereby: { min: 1, max: 500, distribution: { kind: "uniform" } },
  });
});

test("omittable(nullable) nests, with the inner weights over present values", () => {
  const middle = field("middle");
  if (middle.kind !== "omittable" || middle.inner.kind !== "nullable")
    throw new Error(middle.kind);
  expect(share(middle.weights, "omitted")).toBeCloseTo(0.5, 1);
  expect(share(middle.inner.weights, "null")).toBeCloseTo(0.5, 1);
  expect(middle.weights.value).toBe(
    middle.inner.weights.null + middle.inner.weights.value,
  );
});

test("a weighted enum recovers its members and weights", () => {
  const status = field("status");
  if (status.kind !== "enum") throw new Error(status.kind);
  const weights = Object.fromEntries(status.items.map(([w, v]) => [v, w]));
  expect(share(weights, "active")).toBeCloseTo(0.6, 1);
  expect(share(weights, "pending")).toBeCloseTo(0.3, 1);
  expect(share(weights, "banned")).toBeCloseTo(0.1, 1);
});

test("a skewed integer recovers its exponent, as a range rather than an enum", () => {
  const score = field("score");
  if (score.kind !== "number" || score.whereby.distribution.kind !== "skew")
    throw new Error(score.kind);
  expect(score.integer).toBe(true);
  expect(Math.abs(score.whereby.distribution.exponent - 2)).toBeLessThan(0.15);
});

test("a distributed non-ASCII string recovers length and composition", () => {
  const name = field("name");
  if (name.kind !== "string") throw new Error(name.kind);
  const { length, composition } = name.whereby;
  if (typeof length === "number" || length.distribution.kind !== "normal")
    throw new Error("length");
  expect(Math.abs(length.distribution.mean - 8)).toBeLessThan(0.5);
  expect(Math.abs(length.distribution.spread - 3)).toBeLessThan(0.5);

  if (!Array.isArray(composition)) throw new Error("composition form");
  const [lower, latin] = composition;
  expect(lower![1]).toEqual(classes.lowercase);
  const range = latin![1] as { from: number; to: number };
  expect(range.from).toBeGreaterThanOrEqual(0xe0);
  expect(range.to).toBeLessThanOrEqual(0xff);
  expect(lower![0] / (lower![0] + latin![0])).toBeCloseTo(8 / 9, 1);
});

test("an array recovers its length range and element enum", () => {
  const tags = field("tags");
  if (tags.kind !== "array") throw new Error(tags.kind);
  expect(tags.whereby.length).toEqual({
    min: 0,
    max: 5,
    distribution: { kind: "uniform" },
  });
  expect(tags.element.kind).toBe("enum");
});

test("a record with drawn keys comes back as a T.record", () => {
  expect(field("prefs")).toMatchObject({
    kind: "record",
    key: { kind: "string", whereby: { length: 8 } },
    value: { kind: "boolean" },
    whereby: { size: { max: 3 } },
  });
});

test("an ISO string derived from a date comes back as a derive", () => {
  const born = field("born");
  if (born.kind !== "derive") throw new Error(born.kind);
  expect(born.resolve).toBe("isoDateTime");
  expect(born.from.whereby.distribution).toEqual({ kind: "uniform" });
  expect(Date.parse(born.from.whereby.min)).toBeGreaterThanOrEqual(
    Date.parse("1950-01-01"),
  );
});
