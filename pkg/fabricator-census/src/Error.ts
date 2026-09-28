/**
 * Every failure this package raises. Follows core's `FabricatorError` shape
 * (abstract base plus a merged namespace of subclasses), and extends it, so `e
 * instanceof FabricatorError` still catches everything census throws.
 *
 * @module
 */

import { FabricatorError } from "@ghostry/fabricator";

export abstract class CensusError extends FabricatorError {
  constructor() {
    super();
    this.name = "CensusError";
  }
}

export namespace CensusError {
  /**
   * A `CensusOptions` entry outside its domain. Every numeric option is a count
   * of something (samples, keys, levels, bins), so each has an integer floor
   * rather than silently clamping to one.
   */
  export class InvalidOptionError extends CensusError {
    constructor(
      public readonly option: string,
      public readonly value: unknown,
      public readonly expected: string,
    ) {
      super();
      this.name = "InvalidOptionError";
      this.message = `Census option \`${option}\` must be ${expected}; received ${String(value)}.`;
    }
  }

  /**
   * `add` after `finish`. The snapshot `finish` returned is already detached
   * from the accumulator, so a later observation could only ever land in a
   * tally nobody reads; rejecting it keeps a late `add` from looking like it
   * counted.
   */
  export class FinishedError extends CensusError {
    constructor() {
      super();
      this.name = "FinishedError";
      this.message =
        "Cannot add to a census after finish(). Begin a new census for further values.";
    }
  }

  /**
   * A discrete fit requested for a tally holding non-integer values. A discrete
   * target models `discreteSampler`, whose draws are always whole, so no
   * candidate could put mass where these values are.
   */
  export class NonIntegerFitError extends CensusError {
    constructor() {
      super();
      this.name = "NonIntegerFitError";
      this.message =
        "A discrete fit needs integer data; this tally holds non-integer values. Fit it as continuous instead.";
    }
  }
}
