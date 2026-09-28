import type { DateTally as DateOutput } from "../Types";
import type { Context, Path } from "./Context";
import { asDate, NumericTally } from "./Numeric";

/**
 * A `Date`'s instant as epoch milliseconds — the axis core's `T.date` draws on
 * with its continuous `sampler` — tagged back into an ISO string wherever it
 * surfaces as a value.
 */
export class DateTally {
  count = 0;
  private invalid = 0;
  private readonly epoch: NumericTally;

  constructor(context: Context, path: Path) {
    this.epoch = new NumericTally(context, [...path, "#epoch"], asDate);
  }

  add(value: Date): void {
    this.count++;
    const ms = value.getTime();
    if (Number.isNaN(ms)) this.invalid++;
    else this.epoch.add(ms);
  }

  absorb(other: DateTally): void {
    this.count += other.count;
    this.invalid += other.invalid;
    this.epoch.absorb(other.epoch);
  }

  snapshot(): DateOutput {
    return {
      count: this.count,
      invalid: this.invalid,
      epoch: this.epoch.snapshot(),
    };
  }
}
