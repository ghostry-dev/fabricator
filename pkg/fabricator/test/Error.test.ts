import { attest, expect, test } from ".";
import { initialize, FabricatorError } from "@ghostry/fabricator";

/**
 * Not exhaustive over every subclass in `src/Error/index.ts` — the per-kind
 * test files (`Weights.test.ts`, `Enum.test.ts`, `Choice.test.ts`,
 * `Override.test.ts`, `Record.test.ts`, `Recursive.test.ts`, ...) already
 * exercise each call site's `toThrow()`. This file instead pins the one thing
 * none of those assert: that every failure is `instanceof FabricatorError`, and
 * that a representative subclass's context fields are reachable without parsing
 * `.message`.
 */

test("a validation failure is an instance of FabricatorError", () => {
  const { T } = initialize({ salt: "error-instanceof" });

  const schema = T.object({ name: T.always("x") });

  const error = attest.throws(FabricatorError, () =>
    schema.override({ nope: "y" } as any),
  );

  expect(error).toBeInstanceOf(Error);
});

test("an unknown-field override exposes the field name and available fields", () => {
  const { T } = initialize({ salt: "error-fields" });

  const schema = T.object({ name: T.always("x"), age: T.always(1) });

  const error = attest.throws(FabricatorError.UnknownFieldError, () =>
    schema.override({ nope: "y" } as any),
  );

  expect(error.name).toBe("@ghostry/fabricator:UnknownFieldError");
  expect(error.operation).toBe("override");
  expect(error.field).toBe("nope");
  expect(error.available).toEqual(["name", "age"]);
});

test("an invalid override value exposes the field, kind, and rejected value", () => {
  const { T } = initialize({ salt: "error-invalid-value" });

  const schema = T.object({ name: T.string.whereby({ length: { max: 3 } }) });

  const error = attest.throws(FabricatorError.InvalidOverrideValueError, () =>
    schema.override({ name: 5 as unknown as string }),
  );

  expect(error.name).toBe("@ghostry/fabricator:InvalidOverrideValueError");
  expect(error.field).toBe("name");
  expect(error.kind).toBe("string");
  expect(error.value).toBe(5);
});
