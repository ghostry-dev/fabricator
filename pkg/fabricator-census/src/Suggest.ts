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

/** Suggest a schema for every path in a census. */
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
  return new Suggester(resolved, census.options.fields).node(census.root, 0);
}

class Suggester {
  constructor(
    private readonly options: Resolved,
    private readonly fieldLimit: number,
  ) {}

  /**
   * A node's presence first, outermost, then its values. `absent` is non-zero
   * only for an object field; top-level values and array elements are always
   * present, so they never get an `omittable`.
   */
  node(node: Node, absent: number): Suggestion {
    const nulls = node.types.null;
    const undefineds = node.types.undefined;
    const values = node.count - nulls - undefineds;
    const present = node.count;

    if (values === 0) {
      const inner: Suggestion =
        nulls > 0 && undefineds > 0
          ? {
              kind: "choice",
              options: [
                [nulls, { kind: "null", notes: [] }],
                [undefineds, { kind: "undefined", notes: [] }],
              ],
              notes: [],
            }
          : nulls > 0
            ? { kind: "null", notes: [] }
            : undefineds > 0
              ? { kind: "undefined", notes: [] }
              : { kind: "opaque", notes: ["No value was ever observed here."] };
      return absent > 0
        ? {
            kind: "omittable",
            weights: { omitted: absent, value: present },
            inner,
            notes: [],
          }
        : inner;
    }

    const inner = this.values(node);
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
  private values(node: Node): Suggestion {
    const options: Array<[number, Suggestion]> = [];
    const { types } = node;
    const depth = (what: string): Suggestion => ({
      kind: "opaque",
      notes: [
        `${what} past the census's depth limit were counted but not described.`,
      ],
    });

    if (types.number > 0)
      options.push([types.number, this.number(node.number!)]);
    if (types.string > 0)
      options.push([types.string, this.string(node.string!)]);
    if (types.boolean > 0)
      options.push([types.boolean, this.boolean(node.boolean!)]);
    if (types.bigint > 0)
      options.push([types.bigint, this.bigint(node.bigint!)]);
    if (types.date > 0) options.push([types.date, this.date(node.date!)]);
    if (types.array > 0)
      options.push([
        types.array,
        node.array === null ? depth("Arrays") : this.array(node.array),
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

  private number(numeric: Numeric): Suggestion {
    const notes: string[] = [];
    const base = this.finite(numeric, notes);

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
  private finite(numeric: Numeric, notes: string[]): Suggestion | null {
    const summary = numeric.summary;
    if (summary === null) return null;

    if (numeric.consecutive && numeric.finite > 1)
      return {
        kind: "sequence",
        notes: [
          "Values ran 1, 2, 3, … in input order; T.number.integer.sequence counts the same way.",
        ],
      };

    if (summary.min === summary.max)
      return { kind: "always", value: summary.min, notes };

    const fitted = fit(numeric)!;
    const members = this.enumMembers(numeric.frequencies, numeric.finite);

    /**
     * An integer range can already put mass on every value an enum lists, so
     * the enum wins only when the best fit is distinguishable from the data —
     * the enum's own distribution is the data, so its score is zero. A
     * non-integer range puts no mass on any single value.
     */
    if (
      members !== null
      && (!numeric.integer || fitted.score > fitted.threshold)
    )
      return { kind: "enum", items: members, notes };

    const frequencies = numeric.frequencies;
    if (!frequencies.saturated && frequencies.distinct === numeric.finite)
      notes.push(
        "Every value was distinct. Core has no uniqueness facility, so a fabricated range will collide; T.number.integer.sequence or a uuid string avoid that.",
      );

    return {
      kind: "number",
      integer: numeric.integer,
      whereby: {
        min: summary.min,
        max: summary.max,
        distribution: fitted.distribution,
      },
      fit: fitted,
      notes,
    };
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

  private string(tally: StringTally): Suggestion {
    const notes: string[] = [];
    const members = this.enumMembers(tally.frequencies, tally.count);
    if (members !== null) return { kind: "enum", items: members, notes };

    const { frequencies, formats } = tally;
    if (!frequencies.saturated && frequencies.distinct === 1 && frequencies.top)
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

    const { length, fit: lengthFit } = lengthOf(tally.length);
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

  private boolean(tally: BooleanTally): Suggestion {
    if (tally.false === 0) return { kind: "always", value: true, notes: [] };
    if (tally.true === 0) return { kind: "always", value: false, notes: [] };
    return {
      kind: "boolean",
      weights: { true: tally.true, false: tally.false },
      notes: [],
    };
  }

  private bigint(tally: BigIntTally): Suggestion {
    const notes: string[] = [];
    const members = this.enumMembers(tally.frequencies, tally.count);
    if (members !== null) return { kind: "enum", items: members, notes };
    if (tally.min === tally.max)
      return {
        kind: "always",
        value: { type: "bigint", value: tally.min },
        notes,
      };
    notes.push(
      "T.bigint draws uniformly across its range; core has no bigint distributions.",
    );
    return {
      kind: "bigint",
      whereby: { min: tally.min, max: tally.max },
      notes,
    };
  }

  private date(tally: DateTally): Suggestion {
    const notes: string[] = [];
    if (tally.invalid > 0)
      notes.push(
        `${tally.invalid} invalid Dates were observed and left out; core never fabricates one.`,
      );
    if (tally.epoch.summary === null)
      return { kind: "opaque", notes: [...notes, "Every Date was invalid."] };
    const members = this.enumMembers(
      tally.epoch.frequencies,
      tally.epoch.finite,
    );
    if (members !== null) return { kind: "enum", items: members, notes };
    return this.epoch(tally.epoch, notes);
  }

  private epoch(epoch: Numeric, notes: string[]): DateSuggestion {
    const summary = epoch.summary!;
    const fitted = fit(epoch, { discrete: false });
    return {
      kind: "date",
      whereby: {
        min: new Date(summary.min).toISOString(),
        max: new Date(summary.max).toISOString(),
        distribution: fitted?.distribution ?? null,
      },
      fit: fitted,
      notes,
    };
  }

  private array(tally: ArrayTally): Suggestion {
    const { length, fit: lengthFit } = lengthOf(tally.length);
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
      fields: fields.map((field) => ({
        key: field.key,
        value: this.node(field.node, field.absent),
      })),
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

/**
 * A length tally as `whereby`'s `length`: the bare count when every length was
 * equal, otherwise the fitted range. Lengths are whole, so the fit is always
 * discrete — the draw core makes through `discreteSampler`.
 */
function lengthOf(numeric: Numeric): {
  length: SuggestedLength;
  fit: ReturnType<typeof fit>;
} {
  const summary = numeric.summary!;
  const fitted = fit(numeric, { discrete: true });
  if (fitted === null) return { length: summary.min, fit: null };
  return {
    length: {
      min: summary.min,
      max: summary.max,
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
        field !== candidate
        && field.present > 0
        && field.present < objects
        && sums.has(field.present),
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
