/**
 * Named `FakerExtensionError`, not `FakerError` — `@faker-js/faker` already
 * exports that name, and importing both into one scope would collide. Follows
 * core's `FabricatorError` shape (abstract base plus a merged namespace of
 * subclasses) so `e instanceof FabricatorError` still catches everything either
 * package throws.
 */

import { FabricatorError } from "@ghostry/fabricator";

export abstract class FakerExtensionError extends FabricatorError {
  constructor() {
    super();
    this.name = "FakerExtensionError";
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
      this.name = "NoActiveScopeError";
      this.message =
        "A faker builder was invoked outside of fabricate(). Faker builders "
        + "only draw randomness while the schema they belong to is being "
        + "fabricated.";
    }
  }
}
