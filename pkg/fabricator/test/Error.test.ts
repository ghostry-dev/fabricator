import { expect, test } from "bun:test";
import { initialize, FabricatorError } from "@ghostry/fabricator";

/**
 * Not exhaustive over every subclass in `src/Error/index.ts` — the per-kind
 * test files (`Weights.test.ts`, `Enum.test.ts`, `Choice.test.ts`,
 * `Override.test.ts`, `Record.test.ts`, `Recursive.test.ts`, ...) already
 * exercise each call site's `toThrow()`. This file instead pins the one
 * thing none of those assert: that every failure is `instanceof
 * FabricatorError`, and that a representative subclass's context fields are
 * reachable without parsing `.message`.
 */

test("a validation failure is an instance of FabricatorError", () => {
  const { T } = initialize({ seed: "error-instanceof" });

  const schema = T.object({ name: T.always("x") });

  let caught: unknown;
  try {
    schema.override({ nope: "y" } as any);
  } catch (e) {
    caught = e;
  }

  expect(caught).toBeInstanceOf(FabricatorError);
  expect(caught).toBeInstanceOf(Error);
});

test("an unknown-field override exposes the field name and available fields", () => {
  const { T } = initialize({ seed: "error-fields" });

  const schema = T.object({ name: T.always("x"), age: T.always(1) });

  let caught: unknown;
  try {
    schema.override({ nope: "y" } as any);
  } catch (e) {
    caught = e;
  }

  expect((caught as any).name).toBe("UnknownOverrideFieldError");
  expect((caught as any).field).toBe("nope");
  expect((caught as any).available).toEqual(["name", "age"]);
});

test("an invalid override value exposes the field, kind, and rejected value", () => {
  const { T } = initialize({ seed: "error-invalid-value" });

  const schema = T.object({ name: T.string.whereby({ length: { max: 3 } }) });

  let caught: unknown;
  try {
    schema.override({ name: 5 as unknown as string });
  } catch (e) {
    caught = e;
  }

  expect((caught as any).name).toBe("InvalidOverrideValueError");
  expect((caught as any).field).toBe("name");
  expect((caught as any).kind).toBe("string");
  expect((caught as any).value).toBe(5);
});
