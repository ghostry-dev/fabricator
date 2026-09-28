import type { Frequencies, Value } from "../Types";

/**
 * Exact counts per distinct value, up to `capacity` distinct values. Past that
 * the map is dropped rather than truncated: a partial map would under-count
 * every value it evicted, and a field with that many values is not an enum
 * anyway. Keys use `Map`'s SameValueZero, so `-0` and `0` share a count.
 */
export class FrequencyTally<$Key> {
  private map: Map<$Key, number> | null = new Map();

  /** Once saturated, the lower bound on distinct values. */
  private floor = 0;

  constructor(private readonly capacity: number) {}

  add(key: $Key): void {
    const map = this.map;
    if (map === null) return;
    const count = map.get(key);
    if (count !== undefined) {
      map.set(key, count + 1);
      return;
    }
    if (map.size >= this.capacity) {
      this.saturate();
      return;
    }
    map.set(key, 1);
  }

  absorb(other: FrequencyTally<$Key>): void {
    if (this.map === null || other.map === null) {
      this.floor = Math.max(this.distinct(), other.distinct());
      this.map = null;
      return;
    }
    for (const [key, count] of other.map) {
      const existing = this.map.get(key);
      if (existing === undefined) this.map.set(key, count);
      else this.map.set(key, existing + count);
    }
    if (this.map.size > this.capacity) this.saturate();
  }

  snapshot(encode: (key: $Key) => Value): Frequencies {
    const map = this.map;
    if (map === null)
      return {
        distinct: this.floor,
        saturated: true,
        singletons: null,
        top: null,
      };

    let singletons = 0;
    for (const count of map.values()) if (count === 1) singletons++;

    /** `sort` is stable, so equal counts keep first-seen order. */
    const top = [...map]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ value: encode(key), count }));

    return { distinct: map.size, saturated: false, singletons, top };
  }

  private distinct(): number {
    return this.map === null ? this.floor : this.map.size;
  }

  private saturate(): void {
    this.floor = this.capacity + 1;
    this.map = null;
  }
}
