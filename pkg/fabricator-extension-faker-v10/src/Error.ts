/**
 * Named `FakerExtensionError`, not `FakerError` — `@faker-js/faker` already
 * exports that name, and importing both into one scope would collide. Follows
 * core's `FabricatorError` shape (abstract base plus a merged namespace of
 * subclasses) so `e instanceof FabricatorError` still catches everything either
 * package throws. A `name` is prefixed with this package's name, as core's are
 * with its own.
 */

import { FabricatorError } from "@ghostry/fabricator";

export abstract class FakerExtensionError extends FabricatorError {
  constructor() {
    super();
    this.name = "@ghostry/fabricator-extension-faker-v10:FakerExtensionError";
  }
}

export namespace FakerExtensionError {
  /**
   * A faker builder called outside `fabricate()` — the bridge's shared `scope`
   * is only populated while a producer runs inside a leaf's `fabricate()`
   * (`src/index.ts`'s `draw`). A builder captured out of that closure and
   * invoked directly (or whose result is cached and replayed) has no
   * `ProduceContext` to draw from.
   */
  export class NoActiveScopeError extends FakerExtensionError {
    constructor() {
      super();
      this.name = "@ghostry/fabricator-extension-faker-v10:NoActiveScopeError";
      this.message =
        "A faker builder was invoked outside of fabricate(). Faker builders "
        + "only draw randomness while the schema they belong to is being "
        + "fabricated.";
    }
  }

  /**
   * `locale` names no locale. Checked at the `fakerExtension(...)` call rather
   * than left to `new Faker(...)`, which only runs at the first draw (see
   * `src/index.ts`'s `toInstance`): a configuration error belongs at the call
   * the caller wrote.
   */
  export class EmptyLocaleError extends FakerExtensionError {
    constructor() {
      super();
      this.name = "@ghostry/fabricator-extension-faker-v10:EmptyLocaleError";
      this.message =
        "fakerExtension({ locale }) was given no locale. Name at least one, "
        + 'such as { locale: ["base", "en"] }.';
    }
  }

  /**
   * A `locale` name that is not a key of faker's `allLocales`. Only reachable
   * from an untyped caller, since `LocaleName` is that key set, and only at the
   * first draw, since resolving a name is what loads faker.
   */
  export class UnknownLocaleError extends FakerExtensionError {
    constructor(public readonly locale: string) {
      super();
      this.name = "@ghostry/fabricator-extension-faker-v10:UnknownLocaleError";
      this.message = `"${locale}" is not a locale faker defines.`;
    }
  }

  /**
   * A faker builder drew in a runtime that cannot load a module synchronously —
   * a browser bundle, where `#load` resolves to `Load/Unavailable.ts`. Building
   * schemas and adapting them never loads faker, so this fires only when
   * something actually fabricates there. Such a bundle has to contain faker
   * anyway, so it imports it itself and passes `create`.
   */
  export class UnloadableError extends FakerExtensionError {
    constructor() {
      super();
      this.name = "@ghostry/fabricator-extension-faker-v10:UnloadableError";
      this.message =
        "A faker builder was fabricated in a runtime that cannot load "
        + "@faker-js/faker synchronously, such as a browser bundle. To "
        + "fabricate there, import faker yourself and pass `create`: "
        + "fakerExtension({ create: (randomizer) => new Faker({ locale: "
        + "[base, en], randomizer }) }).";
    }
  }

  /**
   * `FakerModules/Words.ts` reads faker's `FakerError` class off the error
   * `helpers.arrayElement([])` throws, rather than importing it (a value import
   * reaches the chunk holding the `Faker` class). Faker 10 always throws there,
   * before drawing; this fires only for a faker release that does not, which is
   * one this package's `lorem`/`word` builders have not been brought in line
   * with (`test/Parity.test.ts`).
   */
  export class FakerErrorUnavailableError extends FakerExtensionError {
    constructor() {
      super();
      this.name =
        "@ghostry/fabricator-extension-faker-v10:FakerErrorUnavailableError";
      this.message =
        "faker.helpers.arrayElement([]) did not throw FakerError, so this "
        + "faker release is not one the lorem/word builders support.";
    }
  }
}
