import { Reservoir } from "../Reservoir";
import type { Histogram, Numeric, Quantiles, Summary, Value } from "../Types";
import type { Context, Path } from "./Context";
import { FrequencyTally } from "./Frequency";

/**
 * How a numeric tally's frequency keys become census values: as themselves for
 * numbers, lengths and counts, or tagged for instants.
 */
export type Encode = (key: number) => Value;

export const asNumber: Encode = (n) => n;

/** Epoch milliseconds tagged back into an ISO string, since JSON has no `Date`. */
export const asDate: Encode = (ms) => ({
  type: "date",
  value: new Date(ms).toISOString(),
});

/**
 * One pass over a stream of numbers. Non-finite values are counted and kept out
 * of everything else; the moments are Welford's running mean with the second
 * and third central moments, exact over every value, and merge by Chan et al.'s
 * pairwise formulas. Quantiles and the histogram come from the reservoir at
 * snapshot time, since a single pass cannot know the range the bins would need
 * up front.
 */
export class NumericTally {
  count = 0;
  finite = 0;
  nan = 0;
  positiveInfinity = 0;
  negativeInfinity = 0;
  negativeZero = 0;

  private whole = true;
  private ordered = true;
  private expected = 1;

  private mean = 0;
  private m2 = 0;
  private m3 = 0;
  private min = Infinity;
  private max = -Infinity;

  private readonly reservoir: Reservoir;
  private readonly frequencies: FrequencyTally<number>;

  constructor(
    private readonly context: Context,
    path: Path,
    private readonly encode: Encode,
  ) {
    this.reservoir = new Reservoir(context.options.reservoir, () =>
      context.random(path),
    );
    this.frequencies = new FrequencyTally(context.options.distinct);
  }

  add(value: number): void {
    this.count++;
    if (Number.isNaN(value)) {
      this.nan++;
      this.ordered = false;
      return;
    }
    if (value === Infinity || value === -Infinity) {
      if (value > 0) this.positiveInfinity++;
      else this.negativeInfinity++;
      this.ordered = false;
      return;
    }
    if (Object.is(value, -0)) {
      this.negativeZero++;
      value = 0;
    }

    this.finite++;
    if (!Number.isInteger(value)) this.whole = false;
    if (this.ordered) {
      if (value === this.expected) this.expected++;
      else this.ordered = false;
    }
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;

    const n = this.finite;
    const delta = value - this.mean;
    const deltaN = delta / n;
    const term = delta * deltaN * (n - 1);
    this.mean += deltaN;
    this.m3 += term * deltaN * (n - 2) - 3 * deltaN * this.m2;
    this.m2 += term;

    this.reservoir.add(value);
    this.frequencies.add(value);
  }

  absorb(other: NumericTally): void {
    if (other.count === 0) return;
    const wasEmpty = this.count === 0;

    this.count += other.count;
    this.nan += other.nan;
    this.positiveInfinity += other.positiveInfinity;
    this.negativeInfinity += other.negativeInfinity;
    this.negativeZero += other.negativeZero;
    this.whole &&= other.whole;

    /**
     * Two runs of `1, 2, 3, …` do not concatenate into one, and a merged tally
     * has no input order anyway; only an empty side leaves the other's answer
     * intact.
     */
    if (wasEmpty) {
      this.ordered = other.ordered;
      this.expected = other.expected;
    } else this.ordered = false;

    if (other.finite > 0) {
      const a = this.finite;
      const b = other.finite;
      const n = a + b;
      const delta = other.mean - this.mean;
      this.m3 +=
        other.m3
        + (delta ** 3 * a * b * (a - b)) / n ** 2
        + (3 * delta * (a * other.m2 - b * this.m2)) / n;
      this.m2 += other.m2 + (delta ** 2 * a * b) / n;
      this.mean += (delta * b) / n;
      this.finite = n;
      if (other.min < this.min) this.min = other.min;
      if (other.max > this.max) this.max = other.max;
    }

    this.reservoir.absorb(other.reservoir);
    this.frequencies.absorb(other.frequencies);
  }

  snapshot(): Numeric {
    return {
      count: this.count,
      finite: this.finite,
      nan: this.nan,
      positiveInfinity: this.positiveInfinity,
      negativeInfinity: this.negativeInfinity,
      negativeZero: this.negativeZero,
      integer: this.finite > 0 && this.whole,
      consecutive:
        this.finite > 0 && this.ordered && this.finite === this.count,
      summary: this.finite > 0 ? this.summary() : null,
      frequencies: this.frequencies.snapshot(this.encode),
    };
  }

  private summary(): Summary {
    const n = this.finite;
    const sorted = this.reservoir.sorted();
    const at = (p: number) => quantile(sorted, p);
    const quantiles: Quantiles = {
      p1: at(0.01),
      p5: at(0.05),
      p25: at(0.25),
      p50: at(0.5),
      p75: at(0.75),
      p95: at(0.95),
      p99: at(0.99),
    };
    return {
      min: this.min,
      max: this.max,
      mean: this.mean,
      stddev: n > 1 ? Math.sqrt(this.m2 / (n - 1)) : 0,
      skewness: this.m2 > 0 ? (Math.sqrt(n) * this.m3) / this.m2 ** 1.5 : 0,
      quantiles,
      histogram: histogram(
        sorted,
        this.min,
        this.max,
        this.finite > 0 && this.whole,
        this.context.options.bins,
      ),
      sample: {
        size: sorted.length,
        exact: sorted.length === n,
        points: downsample(sorted, this.context.options.points),
      },
    };
  }
}

/**
 * Linear interpolation between order statistics (Hyndman & Fan type 7, the
 * default in R and NumPy), so `p = 0` and `p = 1` are the sample's extremes.
 */
function quantile(sorted: ReadonlyArray<number>, p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower]!;
  if (lower === upper) return low;
  const fraction = position - lower;
  return (1 - fraction) * low + fraction * sorted[upper]!;
}

function downsample(sorted: ReadonlyArray<number>, points: number): number[] {
  if (sorted.length <= points) return [...sorted];
  return Array.from({ length: points }, (_, i) =>
    quantile(sorted, i / (points - 1)),
  );
}

/**
 * Integer data bins over `[min, max + 1)` — the interval `discreteSampler`
 * draws over and floors — capped at one bin per integer, so a bin never
 * straddles a value boundary. Positions are computed from halved ends, which
 * cannot overflow even across `±Number.MAX_VALUE`, the same trap core's
 * `sampler` avoids.
 */
function histogram(
  sorted: ReadonlyArray<number>,
  min: number,
  max: number,
  integer: boolean,
  bins: number,
): Histogram {
  const high = integer ? max + 1 : max;
  /**
   * Past 2^53 `max + 1` rounds back to `max`, so the integer span can read as
   * zero; one bin still holds everything.
   */
  const count = Math.max(
    1,
    integer ? Math.min(bins, high - min) : min === max ? 1 : bins,
  );
  const counts = Array.from({ length: count }, () => 0);
  const span = high / 2 - min / 2;

  for (const value of sorted) {
    const position = span > 0 ? (value / 2 - min / 2) / span : 0;
    const index = Math.min(count - 1, Math.floor(position * count));
    counts[index]!++;
  }
  return { min, max: high, counts };
}
