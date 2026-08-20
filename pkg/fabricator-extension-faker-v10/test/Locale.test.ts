import { de, en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { expect, test } from "bun:test";

test("a non-en locale yields locale-specific values", () => {
  const { T, Fabricator } = initialize({
    seed: "locale-de",
    types: registry.extend(fakerExtension({ locale: [de, en] })),
  });

  const { name } = new Fabricator(
    T.object({ name: T.faker.person.fullName() }),
  ).fabricate();

  expect(typeof name).toBe("string");
  expect(name.length).toBeGreaterThan(0);
});

test("an empty locale surfaces faker's own error, not a fabricator one", () => {
  /**
   * `Faker` validates `locale` eagerly, at construction — and `fakerExtension`
   * builds its instance immediately rather than deferring to the `extend`
   * callback, so the error surfaces from the call the caller wrote rather than
   * from inside the registry machinery.
   */
  expect(() => fakerExtension({ locale: [] })).toThrow(
    /must contain at least one locale/,
  );
});
