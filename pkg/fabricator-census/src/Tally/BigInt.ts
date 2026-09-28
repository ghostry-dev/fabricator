import type { BigIntTally as BigIntOutput } from "../Types";
import type { Context } from "./Context";
import { FrequencyTally } from "./Frequency";

/**
 * Exact extremes by bigint comparison, and nothing numeric beyond them: core's
 * `T.bigint` takes a range with no distribution, so moments and a reservoir
 * would have nothing to inform.
 */
export class BigIntTally {
  count = 0;
  private min: bigint | null = null;
  private max: bigint | null = null;
  private readonly frequencies: FrequencyTally<bigint>;

  constructor(context: Context) {
    this.frequencies = new FrequencyTally(context.options.distinct);
  }

  add(value: bigint): void {
    this.count++;
    if (this.min === null || value < this.min) this.min = value;
    if (this.max === null || value > this.max) this.max = value;
    this.frequencies.add(value);
  }

  absorb(other: BigIntTally): void {
    this.count += other.count;
    if (other.min !== null && (this.min === null || other.min < this.min))
      this.min = other.min;
    if (other.max !== null && (this.max === null || other.max > this.max))
      this.max = other.max;
    this.frequencies.absorb(other.frequencies);
  }

  /** Only ever snapshotted after at least one `add`, so both ends are set. */
  snapshot(): BigIntOutput {
    return {
      count: this.count,
      min: String(this.min),
      max: String(this.max),
      frequencies: this.frequencies.snapshot((value) => ({
        type: "bigint",
        value: String(value),
      })),
    };
  }
}
