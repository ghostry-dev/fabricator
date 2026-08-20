import { en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { Kind as TypeBoxKind } from "@sinclair/typebox";
import { expect, test } from "bun:test";

/**
 * The acceptance test for the whole premise: nothing in the mirror itself is
 * `opaque`, so nothing it produces should ever convert to TypeBox's `Unknown` —
 * the mapping `T.opaque` gets because the adapter genuinely cannot constrain it
 * (see the adapter's own `Opaque.test.ts`). Every one of these 251 builders
 * wraps a real core kind instead, specifically so it stays usable with an
 * adapter. `use.opaque` (one of `use`'s 6 escape-hatch forms — bringing the
 * mirror's true total to 257) is the sole, deliberate exception: it exists
 * precisely to reach a shape this package has no kind for, and is carved out of
 * the sweep below rather than a false alarm to chase.
 *
 * Every conversion here is checked at _runtime_, against an inferred local —
 * never `const schema: TString = toTypeBox(...)`. The type-level side of the
 * same coverage lives in `index.types.test.ts` as `Expect<Equal<...>>`, which
 * is both more precise (it pins `TUnion<[TLiteral<"female">, ...]>`, not a
 * loose `TUnion<TLiteral[]>`) and dramatically cheaper.
 *
 * Cheaper because annotating the local forces TypeScript to _structurally_
 * check assignability between `ToTypeBox<...>` — a ~20-branch conditional over
 * recursive Schema interfaces — and a recursive TypeBox interface. A single
 * such check exceeds TypeScript 5's 5,000,000-instantiation budget on its own
 * and fails with TS2589, for a plain core schema as readily as a faker one.
 * `Equal<A, B>`'s identity comparison (`(<T>() => T extends A ? 1 : 2) extends
 * ...`) sidesteps the structural walk entirely — which is why the adapter's own
 * suite asserts 81 conversions that way without trouble, and why this file must
 * not drift back to annotations. `bun run check` runs TypeScript 7, whose
 * budget is larger, so it would not catch that drift.
 */

const { T } = initialize({
  types: registry.extend(fakerExtension({ locale: en })),
});

test("a string-kind builder converts to TString", () => {
  const schema = toTypeBox(T.faker.person.fullName());
  expect(schema.type).toBe("string");
});

test("a date-kind builder converts to TDate", () => {
  const schema = toTypeBox(T.faker.date.past());
  /**
   * `TDate.type` is declared as the literal `'date'`, but the actual
   * `Type.Date()` factory sets it to `'Date'` — a real mismatch between
   * `@sinclair/typebox`'s own runtime and its `.d.ts`, not something to paper
   * over here. `[Kind]` (the symbol every TypeBox schema carries) is consistent
   * between the two, so it's the reliable check.
   */
  expect(schema[TypeBoxKind]).toBe("Date");
});

test("a number-kind builder converts to TNumber", () => {
  const schema = toTypeBox(T.faker.number.int());
  expect(schema.type).toBe("number");
});

test("a boolean-kind builder converts to TBoolean", () => {
  const schema = toTypeBox(T.faker.datatype.boolean());
  expect(schema.type).toBe("boolean");
});

test("a bigint-kind builder converts to TBigInt", () => {
  const schema = toTypeBox(T.faker.number.bigInt());
  expect(schema.type).toBe("bigint");
});

test("an enum-kind builder converts to a union of literals", () => {
  const schema = toTypeBox(T.faker.person.sexType());
  expect(schema[TypeBoxKind]).toBe("Union");
  expect(schema.anyOf.every((m) => m[TypeBoxKind] === "Literal")).toBe(true);
  expect(schema.anyOf.map((m) => m.const).sort()).toEqual([
    "female",
    "generic",
    "male",
  ]);
});

test("a tuple-kind builder converts to TTuple with one entry per slot", () => {
  const schema = toTypeBox(T.faker.location.nearbyGPSCoordinate());
  expect(schema.type).toBe("array");
  expect(schema.items?.map((item) => item.type)).toEqual(["number", "number"]);
});

test("an object-kind builder converts to TObject with the right properties", () => {
  const schema = toTypeBox(T.faker.airline.airport());
  expect(schema.type).toBe("object");
  expect(Object.keys(schema.properties).sort()).toEqual(["iataCode", "name"]);
  expect(schema.properties.name.type).toBe("string");
  expect(schema.properties.iataCode.type).toBe("string");
});

test("color's split text()/channels() nodes convert to TString and TArray<TNumber> respectively", () => {
  const text = toTypeBox(T.faker.color.rgb.text());
  const channels = toTypeBox(T.faker.color.rgb.channels());
  expect(text.type).toBe("string");
  expect(channels.type).toBe("array");
  expect(channels.items.type).toBe("number");
});

test("the categorical sweep: no builder outside use.opaque converts to Unknown", () => {
  const offenders: string[] = [];

  const walk = (node: unknown, path: string): void => {
    if (typeof node === "function") {
      if (path === "T.faker.use.opaque") return;
      const schema = (node as () => unknown)();
      const converted = toTypeBox(schema as never);
      if (
        (converted as unknown as Record<symbol, string>)[TypeBoxKind]
        === "Unknown"
      ) {
        offenders.push(path);
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, `${path}.${key}`);
      }
    }
  };

  walk(T.faker, "T.faker");

  expect(offenders).toEqual([]);
});

test("use.string converts to TString, drawing from the shared stream-backed Faker", () => {
  const schema = toTypeBox(
    T.faker.use.string((f) => f.helpers.fromRegExp("[A-Z]{3}-[0-9]{4}")),
  );
  expect(schema.type).toBe("string");
});

test("use.opaque converts to Unknown — the one, honest exception to the sweep above", () => {
  const schema = toTypeBox(
    T.faker.use.opaque((f) => f.helpers.arrayElement(["free", "pro"] as const)),
  );
  expect(schema[TypeBoxKind]).toBe("Unknown");
});

test("hinted string methods carry their format/pattern through to TString", () => {
  expect(toTypeBox(T.faker.internet.email()).format).toBe("email");
  expect(toTypeBox(T.faker.internet.url()).format).toBe("uri");
  expect(toTypeBox(T.faker.internet.domainName()).format).toBe("hostname");
  expect(toTypeBox(T.faker.string.uuid()).format).toBe("uuid");
  expect(toTypeBox(T.faker.database.mongodbObjectId()).pattern).toBe(
    "^[0-9a-fA-F]{24}$",
  );

  /** An un-hinted string method carries neither keyword. */
  const plain = toTypeBox(T.faker.person.fullName());
  expect(plain.format).toBeUndefined();
  expect(plain.pattern).toBeUndefined();
});
