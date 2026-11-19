/**
 * `#load`'s `default` target: every runtime the `node`/`bun`/`deno` conditions
 * do not name, a browser bundle above all. It imports nothing, so a bundle that
 * builds `T.faker.*` schemas and adapts them carries no faker. A bundle that
 * fabricates there passes `create` and never reaches this.
 *
 * @module
 */

import type * as Faker from "@faker-js/faker";
import { FakerExtensionError } from "../Error.ts";

export function load(): typeof Faker {
  throw new FakerExtensionError.UnloadableError();
}
