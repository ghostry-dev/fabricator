import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";
import { Value } from "@sinclair/typebox/value";

test("a picked schema converts to only its kept properties, hidden dependencies excluded", () => {
  const { T, Fabricator } = initialize({ salt: "typebox-subset" });

  const User = T.object({
    id: T.number.integer.whereby({ min: 1, max: 100 }),
    first: T.string.whereby({ length: { min: 1, max: 8 } }),
    last: T.string.whereby({ length: { min: 1, max: 8 } }),
  }).refine(({ compute }) => ({
    name: compute(T.string)
      .from(["first", "last"])
      .as(({ fabricated }) => `${fabricated.first} ${fabricated.last}`),
  }));

  const picked = T.pick(User, ["id", "name"]);
  const converted = toTypeBox(picked);

  expect(Object.keys(converted.properties)).toEqual(["id", "name"]);
  expect(
    Value.Check(
      { ...converted, additionalProperties: false },
      new Fabricator(picked).fabricate(),
    ),
  ).toBe(true);
});
