import { classes, type CharacterClass } from "@ghostry/fabricator";
import type {
  CharacterBucket,
  CharacterComposition,
  Formats,
  OtherBucket,
  StringTally as StringOutput,
} from "../Types";
import type { Context, Path } from "./Context";
import { FrequencyTally } from "./Frequency";
import { asDate, asNumber, NumericTally } from "./Numeric";

const buckets: ReadonlyArray<CharacterBucket> = [
  "lowercase",
  "uppercase",
  "digit",
  "symbol",
  "space",
  "control",
  "latin1",
  "bmp",
  "astral",
  "surrogate",
];

const others: ReadonlyArray<OtherBucket> = [
  "control",
  "latin1",
  "bmp",
  "astral",
  "surrogate",
];

/**
 * ASCII's bucket per code point, built from core's own `classes` rather than
 * restated, so a census classifies characters against exactly the ranges a
 * suggested `composition` will draw from. Whatever ASCII no class covers
 * (U+0000–U+001F, U+007F) is `control`.
 */
const ascii: ReadonlyArray<CharacterBucket> = (() => {
  const table: CharacterBucket[] = Array.from(
    { length: 0x80 },
    () => "control",
  );
  for (const name of Object.keys(classes) as CharacterClass[])
    for (const { from, to } of classes[name])
      for (let point = from; point <= to; point++) table[point] = name;
  return table;
})();

function bucketOf(point: number): CharacterBucket {
  if (point < 0x80) return ascii[point]!;
  if (point <= 0xff) return "latin1";
  if (point >= 0xd800 && point <= 0xdfff) return "surrogate";
  if (point <= 0xffff) return "bmp";
  return "astral";
}

/**
 * Format sniffing is bounded: the longest string any of these formats needs is
 * far below this, and skipping the rest keeps a column of long text from paying
 * a regex per value.
 */
const FORMAT_LENGTH = 2048;

const patterns = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^[a-z][a-z\d+.-]*:\/\/\S+$/i,
  numeric: /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
  offset: /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i,
  dateTime:
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i,
};

export class StringTally {
  count = 0;
  private readonly length: NumericTally;
  private readonly frequencies: FrequencyTally<string>;
  private epoch: NumericTally | null = null;
  private readonly counts = Object.fromEntries(
    buckets.map((bucket) => [bucket, 0]),
  ) as Record<CharacterBucket, number>;
  private readonly ranges = Object.fromEntries(
    others.map((bucket) => [bucket, null]),
  ) as Record<OtherBucket, { from: number; to: number } | null>;
  private readonly formats: Formats = {
    date: 0,
    dateTime: 0,
    offsetless: 0,
    uuid: 0,
    email: 0,
    url: 0,
    numeric: 0,
  };

  constructor(
    private readonly context: Context,
    private readonly path: Path,
  ) {
    this.length = new NumericTally(context, [...path, "#length"], asNumber);
    this.frequencies = new FrequencyTally(context.options.distinct);
  }

  add(value: string): void {
    this.count++;

    /**
     * `.length` counts UTF-16 code units, the unit core's string Fabricator
     * spends its length budget in; an astral character is two.
     */
    this.length.add(value.length);
    this.frequencies.add(value);

    /**
     * `for…of` walks code points, pairing valid surrogates, so only an unpaired
     * surrogate reaches the `surrogate` bucket.
     */
    for (const character of value) {
      const point = character.codePointAt(0)!;
      const bucket = bucketOf(point);
      this.counts[bucket]++;
      if (bucket in this.ranges) {
        const other = bucket as OtherBucket;
        const range = this.ranges[other];
        if (range === null) this.ranges[other] = { from: point, to: point };
        else {
          if (point < range.from) range.from = point;
          if (point > range.to) range.to = point;
        }
      }
    }

    if (value.length > FORMAT_LENGTH) return;
    if (patterns.uuid.test(value)) this.formats.uuid++;
    if (patterns.email.test(value)) this.formats.email++;
    if (patterns.url.test(value)) this.formats.url++;
    if (patterns.numeric.test(value)) this.formats.numeric++;

    const date = patterns.date.test(value);
    const dateTime = !date && patterns.dateTime.test(value);
    if (!date && !dateTime) return;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return;
    if (date) this.formats.date++;
    else {
      this.formats.dateTime++;
      if (!patterns.offset.test(value)) this.formats.offsetless++;
    }
    this.epoch ??= new NumericTally(
      this.context,
      [...this.path, "#epoch"],
      asDate,
    );
    this.epoch.add(ms);
  }

  absorb(other: StringTally): void {
    this.count += other.count;
    this.length.absorb(other.length);
    this.frequencies.absorb(other.frequencies);
    for (const bucket of buckets) this.counts[bucket] += other.counts[bucket];
    for (const bucket of others) {
      const theirs = other.ranges[bucket];
      if (theirs === null) continue;
      const ours = this.ranges[bucket];
      if (ours === null) this.ranges[bucket] = { ...theirs };
      else {
        ours.from = Math.min(ours.from, theirs.from);
        ours.to = Math.max(ours.to, theirs.to);
      }
    }
    for (const key of Object.keys(this.formats) as Array<keyof Formats>)
      this.formats[key] += other.formats[key];
    if (other.epoch !== null) {
      this.epoch ??= new NumericTally(
        this.context,
        [...this.path, "#epoch"],
        asDate,
      );
      this.epoch.absorb(other.epoch);
    }
  }

  snapshot(): StringOutput {
    const composition: CharacterComposition = {
      counts: { ...this.counts },
      ranges: Object.fromEntries(
        others.map((bucket) => {
          const range = this.ranges[bucket];
          return [bucket, range === null ? null : { ...range }];
        }),
      ) as CharacterComposition["ranges"],
    };
    return {
      count: this.count,
      length: this.length.snapshot(),
      composition,
      frequencies: this.frequencies.snapshot((value) => value),
      formats: { ...this.formats },
      epoch: this.epoch?.snapshot() ?? null,
    };
  }
}
