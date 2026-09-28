import { shuffle, type Stream } from "@ghostry/fabricator";

/**
 * A fixed-capacity uniform sample of a stream of numbers (Vitter's Algorithm
 * R). Until `capacity` values arrive every one is kept, so statistics computed
 * from it are exact; past that, each value seen so far is equally likely to be
 * among `items`.
 *
 * `random` is taken as a factory and called only on the first overflow: most
 * tallies never exceed capacity, and those that do not need no stream.
 */
export class Reservoir {
  readonly items: number[] = [];
  seen = 0;
  private source: Stream | undefined;

  constructor(
    readonly capacity: number,
    private readonly random: () => Stream,
  ) {}

  add(value: number): void {
    this.seen++;
    if (this.items.length < this.capacity) {
      this.items.push(value);
      return;
    }
    const index = Math.floor(this.next() * this.seen);
    if (index < this.capacity) this.items[index] = value;
  }

  /**
   * Fold another reservoir in, leaving this one a uniform sample of both
   * populations. Each reservoir is a uniform subset of its own population, so
   * drawing the union without replacement only needs, at each step, the chance
   * that the next unseen element belongs to either side — their remaining
   * population counts — and then that side's next element in a shuffled order.
   * A side never runs out: an unsaturated side holds its whole population, and
   * a saturated one holds `capacity`, which bounds the draw.
   */
  absorb(other: Reservoir): void {
    if (other.seen === 0) return;
    if (this.seen + other.seen <= this.capacity) {
      this.items.push(...other.items);
      this.seen += other.seen;
      return;
    }

    const left = shuffle(this.items, this.stream());
    const right = shuffle(other.items, this.stream());
    let remainingLeft = this.seen;
    let remainingRight = other.seen;
    let takenLeft = 0;
    let takenRight = 0;
    const size = Math.min(this.capacity, this.seen + other.seen);
    const merged: number[] = [];

    while (merged.length < size) {
      const fromLeft =
        this.next() * (remainingLeft + remainingRight) < remainingLeft;
      if (fromLeft) {
        merged.push(left[takenLeft++]!);
        remainingLeft--;
      } else {
        merged.push(right[takenRight++]!);
        remainingRight--;
      }
    }

    this.items.length = 0;
    this.items.push(...merged);
    this.seen += other.seen;
  }

  sorted(): number[] {
    return [...this.items].sort((a, b) => a - b);
  }

  private next(): number {
    return this.stream().next();
  }

  private stream(): Stream {
    return (this.source ??= this.random());
  }
}
