/**
 * Census → suggestion: for every path, the builder and arguments that would
 * fabricate data shaped like what was observed there. Presence becomes wrapper
 * weights, a type mix becomes a weighted `choice`, and each type's tally
 * becomes its kind's `whereby`, `weighted` or members.
 *
 * @module
 */

import { classes, type CharacterClass } from "@ghostry/fabricator";
import { CensusError } from "./Error";
import {
  factBigInt,
  factNumber,
  resolveFacts,
  type Facts,
  type Sources,
} from "./Facts";
import { fit } from "./Fit/Fit";
import type {
  ArrayTally,
  BigIntTally,
  BooleanTally,
  Census,
  DateSuggestion,
  DateTally,
  Field,
  Frequencies,
  Node,
  Numeric,
  ObjectTally,
  StringTally,
  SuggestedComposition,
  SuggestedFormat,
  SuggestedLength,
  SuggestedValue,
  Suggestion,
  SuggestOptions,
} from "./Types";

type Resolved = Required<{ [K in keyof SuggestOptions]: number }>;

const defaults: Resolved = {
  enumSupport: 5,
  enumSingletons: 0.05,
  formatRate: 0.95,
  recordKeys: 32,
};

const classNames = Object.keys(classes) as CharacterClass[];

/**
 * Where a detected format already has a builder, so a suggestion can name it
 * without this package depending on faker.
 */
const builders: Record<Exclude<SuggestedFormat, "numeric">, string> = {
  uuid: "T.faker.string.uuid()",
  email: "T.faker.internet.email()",
  url: "T.faker.internet.url()",
};

/**
 * One column's resolved facts while it is being suggested, recording which
 * fields a suggestion drew on so it can say when any of them were estimates.
 */
class Column {
  private readonly used = new Set<keyof Facts>();

  constructor(
    private readonly resolved: Facts,
    private readonly sources: Sources,
  ) {}

  get<$Key extends keyof Facts>(key: $Key): Facts[$Key] {
    const value = this.resolved[key];
    if (value !== undefined) this.used.add(key);
    return value;
  }

  /** Whether an estimated field was drawn on, or a field came from `source`. */
  from(key: keyof Facts): "exact" | "estimate" | undefined {
    return this.sources[key];
  }

  notes(): string[] {
    const notes = [...(this.resolved.notes ?? [])];
    if ([...this.used].some((key) => this.sources[key] === "estimate"))
      notes.push(
        "Some figures here are the planner's estimates, drawn from ANALYZE's own sample.",
      );
    return notes;
  }

  /** Non-null values in the table. */
  values(): number {
    return this.get("count") - this.get("nulls");
  }
}

/**
 * Suggest a schema for every path in a census. When the census carries facts,
 * each top-level field with facts takes its presence weights, range, enum
 * members and uniqueness from them — exact over estimated, both over the sample
 * — while distribution shapes are still fitted from the sample.
 */
export function suggest(census: Census, options?: SuggestOptions): Suggestion {
  const resolved = { ...defaults };

  for (const key of Object.keys(defaults) as Array<keyof Resolved>) {
    const value = options?.[key];
    if (value === undefined) continue;

    if (!(typeof value === "number" && value >= 0 && Number.isFinite(value)))
      throw new CensusError.InvalidOptionError(
        key,
        value,
        "a finite number ≥ 0",
      );

    resolved[key] = value;
  }

  const grouped = new Map<string, Facts[]>();
  for (const { column, facts } of census.facts) {
    const list = grouped.get(column) ?? [];
    list.push(facts);
    grouped.set(column, list);
  }

  const columns = new Map<string, { facts: Facts; sources: Sources }>();
  for (const [column, list] of grouped) {
    const resolvedFacts = resolveFacts(list);
    if (resolvedFacts !== null) columns.set(column, resolvedFacts);
  }

  return new Suggester(
    resolved,
    census.options.fields,
    census.root.object,
    columns,
  ).node(census.root, 0);
}

class Suggester {
  constructor(
    private readonly options: Resolved,
    private readonly fieldLimit: number,
    private readonly root: ObjectTally | null,
    private readonly columns: ReadonlyMap<
      string,
      { facts: Facts; sources: Sources }
    >,
  ) {}

  /**
   * A node's presence first, outermost, then its values. `absent` is non-zero
   * only for an object field; top-level values and array elements are always
   * present, so they never get an `omittable`.
   */
  node(node: Node, absent: number, column: Column | null = null): Suggestion {
    const suggestion = this.presence(node, absent, column);
    if (column !== null) suggestion.notes.push(...column.notes());
    return suggestion;
  }

  /**
   * With facts, the table's own null and value counts replace the sample's, and
   * anything only the sample can see — absence, present-`undefined` — is scaled
   * up to the table, so every weight is in one unit.
   */
  private presence(
    node: Node,
    sampledAbsent: number,
    column: Column | null,
  ): Suggestion {
    const scale = column === null ? 1 : column.get("count") / node.count;
    const absent = Math.round(sampledAbsent * scale);
    const undefineds = Math.round(node.types.undefined * scale);
    const nulls = column === null ? node.types.null : column.get("nulls");
    const present = column === null ? node.count : column.get("count");
    const values = Math.max(0, present - nulls - undefineds);
    const sampledValues = node.count - node.types.null - node.types.undefined;

    if (values > 0 && sampledValues === 0) {
      const inner: Suggestion = {
        kind: "opaque",
        notes: [
          "The table holds non-null values here, but the sample had none to describe.",
        ],
      };
      return nulls > 0
        ? {
            kind: "nullable",
            weights: { null: nulls, value: values },
            inner,
            notes: [],
          }
        : inner;
    }

    if (values === 0) {
      const inner = valueless(nulls, undefineds);
      if (absent > 0) return omittable(absent, present, inner);
      return inner;
    }

    const inner = this.values(node, column);
    if (absent > 0) {
      if (undefineds > 0 && nulls > 0)
        return omittable(absent, present, {
          kind: "nullish",
          weights: { null: nulls, undefined: undefineds, value: values },
          inner,
          notes: [],
        });
      if (undefineds > 0)
        return {
          kind: "optional",
          weights: { omitted: absent, undefined: undefineds, value: values },
          inner,
          notes: [],
        };
      if (nulls > 0)
        return omittable(absent, present, {
          kind: "nullable",
          weights: { null: nulls, value: values },
          inner,
          notes: [],
        });
      return omittable(absent, present, inner);
    }
    if (undefineds > 0 && nulls > 0)
      return {
        kind: "nullish",
        weights: { null: nulls, undefined: undefineds, value: values },
        inner,
        notes: [],
      };
    if (undefineds > 0)
      return {
        kind: "undefinable",
        weights: { undefined: undefineds, value: values },
        inner,
        notes: [],
      };
    if (nulls > 0)
      return {
        kind: "nullable",
        weights: { null: nulls, value: values },
        inner,
        notes: [],
      };
    return inner;
  }

  /**
   * The non-null, non-undefined values at a node: one suggestion per type seen,
   * as a weighted `choice` when there is more than one. Arrays and objects past
   * the depth limit were counted but never described, so they can only be
   * opaque.
   */
  private values(node: Node, facts: Column | null): Suggestion {
    const options: Array<[number, Suggestion]> = [];
    const { types } = node;

    /**
     * A column's extremes and members describe one type of value; with a mix,
     * there is no telling which they belong to, so only presence uses them.
     */
    const kinds = (Object.keys(types) as Array<keyof typeof types>).filter(
      (type) => type !== "null" && type !== "undefined" && types[type] > 0,
    );
    const column = kinds.length === 1 ? facts : null;

    const depth = (what: string): Suggestion => ({
      kind: "opaque",
      notes: [
        `${what} past the census's depth limit were counted but not described.`,
      ],
    });

    if (types.number > 0)
      options.push([types.number, this.number(node.number!, column)]);
    if (types.string > 0)
      options.push([types.string, this.string(node.string!, column)]);
    if (types.boolean > 0)
      options.push([types.boolean, this.boolean(node.boolean!, column)]);
    if (types.bigint > 0)
      options.push([types.bigint, this.bigint(node.bigint!, column)]);
    if (types.date > 0)
      options.push([types.date, this.date(node.date!, column)]);
    if (types.array > 0)
      options.push([
        types.array,
        node.array === null ? depth("Arrays") : this.array(node.array, column),
      ]);
    if (types.object > 0)
      options.push([
        types.object,
        node.object === null ? depth("Objects") : this.object(node.object),
      ]);
    if (types.other > 0)
      options.push([
        types.other,
        {
          kind: "opaque",
          notes: [
            "Values census does not walk (class instances, Map, Set, typed arrays, symbols, functions); T.opaque can produce them.",
          ],
        },
      ]);

    if (options.length === 1) return options[0]![1];
    options.sort((a, b) => b[0] - a[0]);
    return { kind: "choice", options, notes: [] };
  }

  private number(numeric: Numeric, column: Column | null): Suggestion {
    const notes: string[] = [];
    const base = this.finite(numeric, notes, column);

    const nonFinite: Array<[number, Suggestion]> = [];
    const special = (
      count: number,
      value: "NaN" | "Infinity" | "-Infinity",
    ) => {
      if (count > 0)
        nonFinite.push([
          count,
          { kind: "always", value: { type: "number", value }, notes: [] },
        ]);
    };
    special(numeric.nan, "NaN");
    special(numeric.positiveInfinity, "Infinity");
    special(numeric.negativeInfinity, "-Infinity");
    if (nonFinite.length === 0) return base!;

    const note =
      "NaN and ±Infinity were observed; whereby ranges cannot produce them, so each is a T.always arm.";
    if (base === null)
      return nonFinite.length === 1
        ? { ...nonFinite[0]![1], notes: [note] }
        : { kind: "choice", options: nonFinite, notes: [note] };
    return {
      kind: "choice",
      options: [
        [numeric.finite, base] as [number, Suggestion],
        ...nonFinite,
      ].sort((a, b) => b[0] - a[0]),
      notes: [note],
    };
  }

  /** The finite numbers of a tally; `null` when there were none. */
  private finite(
    numeric: Numeric,
    notes: string[],
    column: Column | null,
  ): Suggestion | null {
    const summary = numeric.summary;
    if (summary === null) return null;

    if (column !== null && numeric.integer && serial(column))
      return {
        kind: "sequence",
        notes: [
          "The table's values run 1 to its row count with none repeated or null; T.number.integer.sequence counts the same way. A sample cannot show this order itself.",
        ],
      };

    if (numeric.consecutive && numeric.finite > 1)
      return {
        kind: "sequence",
        notes: [
          "Values ran 1, 2, 3, … in input order; T.number.integer.sequence counts the same way.",
        ],
      };

    const range = numericRange(column);
    if (summary.min === summary.max && range === undefined)
      return { kind: "always", value: summary.min, notes };

    const fitted = fit(numeric, { range });
    if (fitted === null) return { kind: "always", value: summary.min, notes };

    const members = this.members(
      numeric.frequencies,
      numeric.finite,
      column,
      notes,
    );

    /**
     * An integer range can already put mass on every value an enum lists, so
     * the enum wins only when the best fit is distinguishable from the data —
     * the enum's own distribution is the data, so its score is zero. A
     * non-integer range puts no mass on any single value.
     */
    if (
      members !== null &&
      (!numeric.integer || fitted.score > fitted.threshold)
    )
      return { kind: "enum", items: members, notes };

    if (unique(numeric.frequencies, numeric.finite, column))
      notes.push(
        "Every value is distinct. Core has no uniqueness facility, so a fabricated range will collide; T.number.integer.sequence or a uuid string avoid that.",
      );

    return {
      kind: "number",
      integer: numeric.integer,
      whereby: {
        min: fitted.min,
        max: fitted.max,
        distribution: fitted.distribution,
      },
      fit: fitted,
      notes,
    };
  }

  /**
   * The weighted members of an enum-like column. With facts whose `top` is
   * every distinct value, the members and weights are the table's; with facts
   * that count more distinct values than an enum allows, there is none, however
   * repetitive the sample looked; otherwise the sample decides.
   */
  private members(
    frequencies: Frequencies,
    count: number,
    column: Column | null,
    notes: string[],
  ): Array<[number, SuggestedValue]> | null {
    if (column === null) return this.enumMembers(frequencies, count);

    const values = column.values();
    const top = column.get("top");

    if (top !== undefined && column.get("complete") === true) {
      const singletons = top.filter((entry) => entry.count === 1).length;

      if (
        top.length < 2 ||
        values / top.length < this.options.enumSupport ||
        singletons / values > this.options.enumSingletons
      )
        return null;

      return top.map(({ value, count }): [number, SuggestedValue] => [
        count,
        value,
      ]);
    }

    const distinct = column.get("distinct");
    const sampled = this.enumMembers(frequencies, count);

    if (
      distinct !== undefined &&
      values / distinct < this.options.enumSupport
    ) {
      if (sampled !== null)
        notes.push(
          `The sample repeated few values, but the table holds ${distinct} distinct ones — too many for an enum.`,
        );

      return null;
    }

    if (sampled !== null && top !== undefined)
      notes.push(
        "The table has more distinct values than its facts counted, so members come from the sample and rare ones may be missing.",
      );

    return sampled;
  }

  /**
   * The weighted members of an enum-like tally, or `null`. Enum-like means few
   * enough distinct values to have been counted exactly, each seen repeatedly
   * on average, and few seen only once.
   */
  private enumMembers(
    frequencies: Frequencies,
    count: number,
  ): Array<[number, SuggestedValue]> | null {
    const { distinct, saturated, singletons, top } = frequencies;
    if (saturated || singletons === null || distinct < 2) return null;
    if (count / distinct < this.options.enumSupport) return null;
    if (singletons / count > this.options.enumSingletons) return null;
    return top!.map(({ value, count }): [number, SuggestedValue] => [
      count,
      value,
    ]);
  }

  private string(tally: StringTally, column: Column | null = null): Suggestion {
    const notes: string[] = [];
    const members = this.members(tally.frequencies, tally.count, column, notes);

    if (members !== null) return { kind: "enum", items: members, notes };

    const { frequencies, formats } = tally;
    const only = single(column);

    if (only !== undefined) return { kind: "always", value: only, notes };

    if (
      column === null &&
      !frequencies.saturated &&
      frequencies.distinct === 1 &&
      frequencies.top
    )
      return { kind: "always", value: frequencies.top[0]!.value, notes };

    const rate = (count: number) =>
      count / tally.count >= this.options.formatRate;

    if (tally.epoch !== null && rate(formats.date + formats.dateTime)) {
      const resolve =
        formats.dateTime >= formats.date ? "isoDateTime" : "isoDate";
      if (formats.offsetless > 0)
        notes.push(
          `${formats.offsetless} date-times had no offset and were read as local time when parsed; toISOString() will write them back in UTC.`,
        );
      return {
        kind: "derive",
        from: this.epoch(tally.epoch, []),
        resolve,
        notes,
      };
    }

    let format: SuggestedFormat | null = null;
    for (const name of ["uuid", "email", "url", "numeric"] as const)
      if (rate(formats[name])) {
        format = name;
        break;
      }
    if (format === "numeric")
      notes.push(
        "Every value is a number written as a string — often a driver returning int8 or numeric as text. If so, a number suggestion fits better.",
      );
    else if (format !== null)
      notes.push(
        `Values look like ${format}s; ${builders[format]} produces those, with a hints.format of "${format === "url" ? "uri" : format}" for adapters.`,
      );

    if (unique(frequencies, tally.count, column))
      notes.push(
        "Every value is distinct. Core has no uniqueness facility, so fabricated strings can collide; a uuid avoids that.",
      );

    const lengths = column?.get("length");
    let range: { min: number; max: number } | undefined;

    if (lengths !== undefined) {
      /**
       * The table measures length in code points and a census in UTF-16 units,
       * which agree only while no character lies outside the Basic Multilingual
       * Plane — so the table's range is used only when the sample saw none.
       */
      if (tally.composition.counts.astral === 0) range = lengths;
      else
        notes.push(
          "The table's lengths count code points, and the sample held characters outside the Basic Multilingual Plane, so lengths here come from the sample in UTF-16 units.",
        );
    }

    const { length, fit: lengthFit } = lengthOf(tally.length, range);
    const composition = compositionOf(tally);

    if (composition !== null)
      notes.push(
        "composition draws each code point uniformly within its source, so per-character frequencies are not reproduced.",
      );

    return {
      kind: "string",
      whereby: composition === null ? { length } : { length, composition },
      fit: lengthFit,
      format,
      notes,
    };
  }

  private boolean(tally: BooleanTally, column: Column | null): Suggestion {
    let yes = tally.true;
    let no = tally.false;
    const top = column?.get("top");

    if (top !== undefined && column?.get("complete") === true) {
      yes = top.find((entry) => entry.value === true)?.count ?? 0;
      no = top.find((entry) => entry.value === false)?.count ?? 0;
    }

    if (no === 0) return { kind: "always", value: true, notes: [] };
    if (yes === 0) return { kind: "always", value: false, notes: [] };
    return { kind: "boolean", weights: { true: yes, false: no }, notes: [] };
  }

  private bigint(tally: BigIntTally, column: Column | null): Suggestion {
    const notes: string[] = [];
    const members = this.members(tally.frequencies, tally.count, column, notes);
    if (members !== null) return { kind: "enum", items: members, notes };

    let min = BigInt(tally.min);
    let max = BigInt(tally.max);
    const low = column?.get("min");
    const high = column?.get("max");

    if (low !== undefined && high !== undefined) {
      const factMin = BigInt(factBigInt(low));
      const factMax = BigInt(factBigInt(high));
      if (factMin < min) min = factMin;
      if (factMax > max) max = factMax;
    }

    if (min === max)
      return {
        kind: "always",
        value: { type: "bigint", value: String(min) },
        notes,
      };

    notes.push(
      "T.bigint draws uniformly across its range; core has no bigint distributions.",
    );

    return {
      kind: "bigint",
      whereby: { min: String(min), max: String(max) },
      notes,
    };
  }

  private date(tally: DateTally, column: Column | null): Suggestion {
    const notes: string[] = [];

    if (tally.invalid > 0)
      notes.push(
        `${tally.invalid} invalid Dates were observed and left out; core never fabricates one.`,
      );

    if (tally.epoch.summary === null)
      return { kind: "opaque", notes: [...notes, "Every Date was invalid."] };

    const members = this.members(
      tally.epoch.frequencies,
      tally.epoch.finite,
      column,
      notes,
    );

    if (members !== null) return { kind: "enum", items: members, notes };

    return this.epoch(tally.epoch, notes, numericRange(column));
  }

  private epoch(
    epoch: Numeric,
    notes: string[],
    range?: { min: number; max: number },
  ): DateSuggestion {
    const summary = epoch.summary!;
    const fitted = fit(epoch, { discrete: false, range });

    const min =
      range === undefined ? summary.min : Math.min(summary.min, range.min);
    const max =
      range === undefined ? summary.max : Math.max(summary.max, range.max);

    return {
      kind: "date",
      whereby: {
        min: new Date(min).toISOString(),
        max: new Date(max).toISOString(),
        distribution: fitted?.distribution ?? null,
      },
      fit: fitted,
      notes,
    };
  }

  private array(tally: ArrayTally, column: Column | null = null): Suggestion {
    const { length, fit: lengthFit } = lengthOf(
      tally.length,
      column?.get("length"),
    );

    const element: Suggestion =
      tally.element.count === 0
        ? { kind: "opaque", notes: ["Every array was empty."] }
        : this.node(tally.element, 0);

    return {
      kind: "array",
      whereby: { length },
      fit: lengthFit,
      element,
      notes: [],
    };
  }

  private object(tally: ObjectTally): Suggestion {
    if (tally.record) {
      const size = tally.size.summary!;
      return {
        kind: "record",
        key: this.string(tally.keys),
        value: this.node(tally.value!, 0),
        whereby: { size: { max: size.max, minTried: size.min } },
        notes: [
          `This object passed the census's limit of ${this.fieldLimit} distinct keys, so its keys read as data rather than structure.`,
          "T.record's size draws uniformly, and colliding keys collapse, so minTried is not a guaranteed floor.",
        ],
      };
    }

    const fields = tally.fields!;
    const notes: string[] = [];
    const suggestion: Suggestion = {
      kind: "object",
      fields: fields.map((field) => {
        const facts =
          tally === this.root ? this.columns.get(field.key) : undefined;
        const column =
          facts === undefined ? null : new Column(facts.facts, facts.sources);

        return {
          key: field.key,
          value: this.node(field.node, field.absent, column),
        };
      }),
      notes,
    };

    if (fields.length > this.options.recordKeys) {
      const types = new Set(fields.map((field) => dominant(field.node)));
      if (types.size === 1)
        notes.push(
          `${fields.length} keys all hold ${[...types][0]} values; if the keys are data rather than structure, T.record fits better than T.object.`,
        );
    }
    const discriminant = discriminantOf(fields, tally.count);
    if (discriminant !== null) notes.push(discriminant);
    return suggestion;
  }
}

function omittable(
  absent: number,
  present: number,
  inner: Suggestion,
): Suggestion {
  return {
    kind: "omittable",
    weights: { omitted: absent, value: present },
    inner,
    notes: [],
  };
}

/** A node that only ever held `null` or `undefined`, never a value. */
function valueless(nulls: number, undefineds: number): Suggestion {
  if (nulls > 0 && undefineds > 0)
    return {
      kind: "choice",
      options: [
        [nulls, { kind: "null", notes: [] }],
        [undefineds, { kind: "undefined", notes: [] }],
      ],
      notes: [],
    };

  if (nulls > 0) return { kind: "null", notes: [] };
  if (undefineds > 0) return { kind: "undefined", notes: [] };

  return { kind: "opaque", notes: ["No value was ever observed here."] };
}

/**
 * A length tally as `whereby`'s `length`: the bare count when every length was
 * equal, otherwise the fitted range. Lengths are whole, so the fit is always
 * discrete — the draw core makes through `discreteSampler`.
 */
function lengthOf(
  numeric: Numeric,
  range?: { min: number; max: number },
): { length: SuggestedLength; fit: ReturnType<typeof fit> } {
  const summary = numeric.summary!;
  const fitted = fit(numeric, { discrete: true, range });
  if (fitted === null) return { length: summary.min, fit: null };
  return {
    length: {
      min: fitted.min,
      max: fitted.max,
      distribution: fitted.distribution,
    },
    fit: fitted,
  };
}

/**
 * The record form when only core's classes occurred; the pair form otherwise,
 * since `Composition` is one form or the other. Pair sources are the classes'
 * own ranges, so a suggestion draws from exactly what was classified.
 */
function compositionOf(tally: StringTally): SuggestedComposition | null {
  const { counts, ranges } = tally.composition;
  const others = (Object.keys(ranges) as Array<keyof typeof ranges>).filter(
    (bucket) => counts[bucket] > 0,
  );
  const used = classNames.filter((name) => counts[name] > 0);
  if (used.length === 0 && others.length === 0) return null;

  if (others.length === 0)
    return Object.fromEntries(used.map((name) => [name, counts[name]]));

  return [
    ...used.map(
      (name): [number, ReadonlyArray<{ from: number; to: number }>] => [
        counts[name],
        classes[name].map((range) => ({ ...range })),
      ],
    ),
    ...others.map((bucket): [number, { from: number; to: number }] => [
      counts[bucket],
      { ...ranges[bucket]! },
    ]),
  ];
}

/**
 * A column whose values are exactly `1` to its row count: no nulls, `min` 1 and
 * `max` the count from exact facts, and every value distinct — exactly by a
 * count, or by the planner's estimate within 1%. Integer values in `[1,
 * count]`, `count` of them, all distinct, can only be `1, 2, …, count`.
 */
function serial(column: Column): boolean {
  const count = column.get("count");
  const min = column.get("min");
  const max = column.get("max");
  const distinct = column.get("distinct");

  if (column.get("nulls") !== 0 || count < 2) return false;

  if (min === undefined || max === undefined || distinct === undefined)
    return false;

  if (column.from("min") !== "exact" || column.from("max") !== "exact")
    return false;

  if (factNumber(min) !== 1 || factNumber(max) !== count) return false;

  return column.from("distinct") === "exact"
    ? distinct === count
    : distinct >= 0.99 * count;
}

/** A column's extremes as a numeric range, when its facts have both. */
function numericRange(
  column: Column | null,
): { min: number; max: number } | undefined {
  const min = column?.get("min");
  const max = column?.get("max");

  if (min === undefined || max === undefined) return undefined;

  return { min: factNumber(min), max: factNumber(max) };
}

/**
 * Whether every value is distinct: by the table's facts when they counted
 * distinct values, otherwise by the sample's own frequencies.
 */
function unique(
  frequencies: Frequencies,
  count: number,
  column: Column | null,
): boolean {
  const distinct = column?.get("distinct");

  if (column !== null && distinct !== undefined)
    return column.values() > 1 && distinct === column.values();

  return !frequencies.saturated && count > 1 && frequencies.distinct === count;
}

/** The one value a column holds, when its facts say there is only one. */
function single(column: Column | null): SuggestedValue | undefined {
  const top = column?.get("top");
  if (top === undefined || column?.get("complete") !== true) return undefined;
  return top.length === 1 ? top[0]!.value : undefined;
}

/** The most frequent non-null type at a node, for comparing fields' shapes. */
function dominant(node: Node): string {
  let best = "undefined";
  let count = -1;
  for (const [type, seen] of Object.entries(node.types))
    if (type !== "null" && type !== "undefined" && seen > count) {
      best = type;
      count = seen;
    }
  return best;
}

/**
 * A cheap union detector over marginal counts only: an always-present string
 * field with a handful of values, where at least two optional fields are
 * present in exactly as many objects as some subset of those values. A census
 * keeps no joint counts, so this cannot confirm the split — only point at it.
 */
function discriminantOf(
  fields: ReadonlyArray<Field>,
  objects: number,
): string | null {
  for (const candidate of fields) {
    const node = candidate.node;
    const top = node.string?.frequencies.top;
    if (candidate.absent > 0 || node.types.string !== node.count || !top)
      continue;
    if (top.length < 2 || top.length > 8) continue;

    const sums = new Set<number>();
    for (let mask = 1; mask < (1 << top.length) - 1; mask++) {
      let sum = 0;
      for (let i = 0; i < top.length; i++)
        if (mask & (1 << i)) sum += top[i]!.count;
      sums.add(sum);
    }
    const split = fields.filter(
      (field) =>
        field !== candidate &&
        field.present > 0 &&
        field.present < objects &&
        sums.has(field.present),
    );
    if (split.length >= 2)
      return `\`${candidate.key}\` may discriminate a union: ${split
        .map((field) => `\`${field.key}\``)
        .join(
          ", ",
        )} are each present in exactly as many objects as some of its values. Census keeps no joint counts to confirm it; if so, a T.choice of one T.object per value fits better than optional fields.`;
  }
  return null;
}
