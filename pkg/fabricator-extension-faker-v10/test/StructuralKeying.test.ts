import { en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { expect, test } from "bun:test";

/**
 * Mirrors `pkg/fabricator/test/StructuralKeying.test.ts`: a faker builder's
 * stream is keyed by its own structural path, exactly like any other kind's,
 * so inserting, reordering, or renaming a sibling field must not perturb it.
 */

const types = () => registry.extend(fakerExtension({ locale: en }));

test("inserting a field leaves an existing faker field's value unchanged", () => {
  const seed = "insert-field";

  const { T: T1, Fabricator: F1 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const before = new F1(
    T1.object({ name: T1.faker.person.fullName() }),
  ).fabricate();

  const { T: T2, Fabricator: F2 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const after = new F2(
    T2.object({
      id: T2.string.whereby({ length: { max: 8 } }),
      name: T2.faker.person.fullName(),
    }),
  ).fabricate();

  expect(after.name).toBe(before.name);
});

test("reordering fields leaves each faker field's own value unchanged", () => {
  const seed = "reorder-fields";

  const { T: T1, Fabricator: F1 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const forward = new F1(
    T1.object({
      name: T1.faker.person.fullName(),
      email: T1.faker.internet.email(),
    }),
  ).fabricate();

  const { T: T2, Fabricator: F2 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const reversed = new F2(
    T2.object({
      email: T2.faker.internet.email(),
      name: T2.faker.person.fullName(),
    }),
  ).fabricate();

  expect(reversed.name).toBe(forward.name);
  expect(reversed.email).toBe(forward.email);
});

test("renaming a faker field changes only that field's own value, not its siblings'", () => {
  const seed = "rename-field";

  const { T: T1, Fabricator: F1 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const original = new F1(
    T1.object({
      name: T1.faker.person.fullName(),
      email: T1.faker.internet.email(),
    }),
  ).fabricate();

  const { T: T2, Fabricator: F2 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const renamed = new F2(
    T2.object({
      fullName: T2.faker.person.fullName(),
      email: T2.faker.internet.email(),
    }),
  ).fabricate();

  expect(renamed.email).toBe(original.email);
  expect(renamed.fullName).not.toBe(original.name);
});
