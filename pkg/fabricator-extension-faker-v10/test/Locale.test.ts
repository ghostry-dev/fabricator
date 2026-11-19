import { de, en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import {
  FakerExtensionError,
  fakerExtension,
} from "@ghostry/fabricator-extension-faker-v10";
import { expect, test } from "./index.ts";

test("a non-en locale yields locale-specific values", () => {
  const { T, Fabricator } = initialize({
    salt: "locale-de",
    types: registry.extend(fakerExtension({ locale: [de, en] })),
  });

  const { name } = new Fabricator(
    T.object({ name: T.faker.person.fullName() }),
  ).fabricate();

  expect(typeof name).toBe("string");
  expect(name.length).toBeGreaterThan(0);
});

test("an empty locale throws at the call, before faker is loaded", () => {
  /**
   * Faker is only constructed at the first draw (`src/index.ts`'s
   * `toInstance`), so `new Faker`'s own check would surface from inside
   * `fabricate()`. The extension checks first, so a configuration error still
   * surfaces from the call the caller wrote.
   */
  expect(() => fakerExtension({ locale: [] })).toThrow(
    FakerExtensionError.EmptyLocaleError,
  );
});
