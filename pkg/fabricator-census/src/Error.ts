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

  /**
   * An identifier no quoting can express: empty, or containing a NUL. Every
   * other name is quoted into a single identifier, so this is the only
   * identifier a SQL builder refuses.
   */
  export class InvalidIdentifierError extends CensusError {
    constructor(public readonly identifier: string) {
      super();
      this.name = "InvalidIdentifierError";
      this.message = `${JSON.stringify(identifier)} cannot be used as a SQL identifier: it is empty or contains a NUL character.`;
    }
  }

  /**
   * A catalog query found no table by that name. `to_regclass` resolves the
   * name against the connection's `search_path` when it has no schema, and
   * returns nothing for a table the role cannot see.
   */
  export class UnknownTableError extends CensusError {
    constructor(public readonly table: string) {
      super();
      this.name = "UnknownTableError";
      this.message = `No table ${table} is visible to this connection.`;
    }
  }

  /**
   * A result row whose field did not hold what the query asked for — usually
   * rows from a different query handed to this one's `read`.
   */
  export class UnexpectedRowError extends CensusError {
    constructor(
      public readonly field: string,
      public readonly value: unknown,
    ) {
      super();
      this.name = "UnexpectedRowError";
      this.message = `Result field \`${field}\` held ${String(value)}, which this query's reader cannot parse. Was it given another query's rows?`;
    }
  }

  /**
   * A table that the planner has no row estimate for, under a `catalog` budget
   * that rules out counting it. `ANALYZE` gives it one.
   */
  export class UnanalyzedTableError extends CensusError {
    constructor(public readonly table: string) {
      super();
      this.name = "UnanalyzedTableError";
      this.message = `${table} has never been analyzed, so the catalog has no row estimate. Run ANALYZE on it, or allow a scan to count its rows.`;
    }
  }
}
