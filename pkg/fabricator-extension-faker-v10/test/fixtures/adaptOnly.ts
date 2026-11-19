/**
 * What a browser app that reuses schemas without fabricating them imports: a
 * shared registry with the faker extension, schemas built from `T.faker.*`, and
 * their TypeBox conversion. `test/Bundle.test.ts` bundles this for the browser
 * and asserts faker is nowhere in the output.
 */

import { initialize, registry } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";

export const { T, Fabricator } = initialize({
  clock: "derived",
  types: registry.extend(fakerExtension({ locale: ["base", "en"] })),
});

export const User = T.object({
  name: T.faker.person.fullName(),
  bio: T.faker.lorem.paragraph(),
  color: T.faker.color.rgb.channels(),
});

export const schema = toTypeBox(User);
