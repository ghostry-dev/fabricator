/**
 * The positive control for `test/Bundle.test.ts`'s detector: a module that does
 * reference faker's data, so a bundle of it must contain faker.
 */

import { en } from "@faker-js/faker";

export const locale = en;
