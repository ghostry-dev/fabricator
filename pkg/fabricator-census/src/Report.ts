/**
 * A census and its suggestions as text: one line per path, written as the
 * builder call it suggests, followed by that path's notes and fit scores. Meant
 * for reading, not for pasting — composites show their children as `…` and list
 * each child on its own path below.
 *
 * @module
 */

import { classes, type CharacterClass } from "@ghostry/fabricator";
import { suggest } from "./Suggest";
import type {
  Census,
  Fit,
  FittedDistribution,
  SuggestedComposition,
  SuggestedLength,
  SuggestedValue,
  Suggestion,
} from "./Types";

/** Enum members shown before the rest are elided. */
const MEMBERS = 8;

/** Render a census as text, suggesting from it when no suggestion is given. */
export function report(
  census: Census,
  suggestion: Suggestion = suggest(census),
): string {
  const lines: string[] = [`Census of ${census.root.count} values.`, ""];
  walk(suggestion, "$", lines);
  lines.push(
    "",
    "Not detected: cross-field correlations (a field present only when another holds some value), discriminated unions, positional tuples, and recursive schemas.",
  );
  return lines.join("\n");
}

function walk(suggestion: Suggestion, path: string, lines: string[]): void {
  lines.push(`${path}  ${expression(suggestion)}`);
  describe(suggestion, lines);
  for (const [child, suffix] of children(suggestion))
    walk(child, `${path}${suffix}`, lines);
}

/** Notes and fit scores, through any wrappers down to the kind they wrap. */
function describe(suggestion: Suggestion, lines: string[]): void {
  let current: Suggestion | undefined = suggestion;
  while (current !== undefined) {
    for (const note of current.notes) lines.push(`    note: ${note}`);
    const fitted = fitOf(current);
    if (fitted !== null) lines.push(`    fit: ${scores(fitted)}`);
    current = "inner" in current ? current.inner : undefined;
  }
}

function fitOf(suggestion: Suggestion): Fit | null {
  switch (suggestion.kind) {
    case "number":
    case "date":
    case "string":
    case "array":
      return suggestion.fit;
    case "derive":
      return suggestion.from.fit;
    default:
      return null;
  }
}

function scores(fitted: Fit): string {
  const list = fitted.candidates
    .map((c) => `${c.distribution.kind} ${c.score.toFixed(4)}`)
    .join(" · ");
  return `${list} (simpler wins within ${fitted.threshold.toFixed(4)}, n = ${fitted.n})`;
}

/**
 * The children listed on their own lines, with the path segment each extends
 * by: `.key` for a field, `[]` for an element, `{key}`/`{value}` for a record,
 * `|i` for a `choice` arm. Every field is listed; any other child only when it
 * has children or notes of its own.
 */
function children(suggestion: Suggestion): Array<[Suggestion, string]> {
  switch (suggestion.kind) {
    case "object":
      return suggestion.fields.map(({ key, value }) => [value, `.${key}`]);
    case "array":
      return listed(suggestion.element) ? [[suggestion.element, "[]"]] : [];
    case "record": {
      const listing: Array<[Suggestion, string]> = [];
      if (listed(suggestion.key)) listing.push([suggestion.key, "{key}"]);
      if (listed(suggestion.value)) listing.push([suggestion.value, "{value}"]);
      return listing;
    }
    case "choice":
      return suggestion.options
        .map(([, option], i): [Suggestion, string] => [option, `|${i}`])
        .filter(([option]) => listed(option));
    case "nullable":
    case "nullish":
    case "undefinable":
    case "omittable":
    case "optional":
      return children(suggestion.inner);
    default:
      return [];
  }
}

/**
 * Whether a suggestion has children of its own to list, and so reads as `…`
 * inline.
 */
function expands(suggestion: Suggestion): boolean {
  switch (suggestion.kind) {
    case "object":
    case "record":
      return true;
    case "array":
    case "choice":
      return children(suggestion).length > 0;
    case "nullable":
    case "nullish":
    case "undefinable":
    case "omittable":
    case "optional":
      return expands(suggestion.inner);
    default:
      return false;
  }
}

/**
 * Whether a suggestion needs a line of its own: children to list, or notes to
 * show.
 */
function listed(suggestion: Suggestion): boolean {
  return expands(suggestion) || noted(suggestion);
}

function noted(suggestion: Suggestion): boolean {
  if (suggestion.notes.length > 0) return true;
  return "inner" in suggestion && noted(suggestion.inner);
}

function inline(suggestion: Suggestion): string {
  return expands(suggestion) ? "…" : expression(suggestion);
}

function expression(suggestion: Suggestion): string {
  switch (suggestion.kind) {
    case "sequence":
      return "T.number.integer.sequence";
    case "always":
      return `T.always(${literal(suggestion.value)})`;
    case "null":
      return "T.null";
    case "undefined":
      return "T.undefined";
    case "opaque":
      return "T.opaque(() => …)";
    case "number": {
      const { min, max, distribution } = suggestion.whereby;
      return `T.number${suggestion.integer ? ".integer" : ""}.whereby({ min: ${min}, max: ${max}, distribution: ${render(distribution)} })`;
    }
    case "enum": {
      const shown = suggestion.items
        .slice(0, MEMBERS)
        .map(([weight, value]) => `[${weight}, ${literal(value)}]`);
      if (suggestion.items.length > MEMBERS)
        shown.push(`… ${suggestion.items.length - MEMBERS} more`);
      return `T.enum.weighted([${shown.join(", ")}])`;
    }
    case "string": {
      const { length, composition } = suggestion.whereby;
      const parts = [`length: ${lengthText(length)}`];
      if (composition !== undefined)
        parts.push(`composition: ${compositionText(composition)}`);
      return `T.string.whereby({ ${parts.join(", ")} })`;
    }
    case "derive": {
      const resolve =
        suggestion.resolve === "isoDate"
          ? "d.toISOString().slice(0, 10)"
          : "d.toISOString()";
      return `T.derive({ to: T.string, from: [${expression(suggestion.from)}] }).as(([d]) => ${resolve})`;
    }
    case "boolean":
      return `T.boolean.weighted({ true: ${suggestion.weights.true}, false: ${suggestion.weights.false} })`;
    case "bigint":
      return `T.bigint.whereby({ min: BigInt("${suggestion.whereby.min}"), max: BigInt("${suggestion.whereby.max}") })`;
    case "date": {
      const { min, max, distribution } = suggestion.whereby;
      const parts = [`min: new Date("${min}")`, `max: new Date("${max}")`];
      if (distribution !== null)
        parts.push(`distribution: ${render(distribution, true)}`);
      return `T.date.whereby({ ${parts.join(", ")} })`;
    }
    case "array":
      return `T.array(${inline(suggestion.element)}).whereby({ length: ${lengthText(suggestion.whereby.length)} })`;
    case "object":
      return `T.object({ ${suggestion.fields.map(({ key }) => JSON.stringify(key)).join(", ")} })`;
    case "record": {
      const { max, minTried } = suggestion.whereby.size;
      return `T.record(${inline(suggestion.key)}, ${inline(suggestion.value)}).whereby({ size: { max: ${max}, minTried: ${minTried} } })`;
    }
    case "choice":
      return `T.choice.weighted([${suggestion.options
        .map(([weight, option]) => `[${weight}, ${inline(option)}]`)
        .join(", ")}])`;
    case "nullable":
    case "nullish":
    case "undefinable":
    case "omittable":
    case "optional": {
      const weights = Object.entries(suggestion.weights)
        .map(([outcome, weight]) => `${outcome}: ${weight}`)
        .join(", ");
      return `T.${suggestion.kind}(${inline(suggestion.inner)}).weighted({ ${weights} })`;
    }
  }
}

function lengthText(length: SuggestedLength): string {
  if (typeof length === "number") return String(length);
  return `{ min: ${length.min}, max: ${length.max}, distribution: ${render(length.distribution)} }`;
}

/**
 * Parameters rounded to four significant figures for reading; epoch
 * milliseconds rounded to whole milliseconds instead, since four figures of a
 * 13-digit instant would be months off.
 */
function render(distribution: FittedDistribution, epoch = false): string {
  const number = (n: number) =>
    epoch ? String(Math.round(n)) : String(Number(n.toPrecision(4)));
  switch (distribution.kind) {
    case "uniform":
    case "logarithmic":
      return `{ kind: "${distribution.kind}" }`;
    case "skew":
      return `{ kind: "skew", exponent: ${Number(distribution.exponent.toPrecision(4))} }`;
    case "triangular":
      return `{ kind: "triangular", mode: ${number(distribution.mode)} }`;
    case "normal":
      return `{ kind: "normal", mean: ${number(distribution.mean)}, spread: ${number(distribution.spread)} }`;
  }
}

function compositionText(composition: SuggestedComposition): string {
  if (!Array.isArray(composition))
    return `{ ${Object.entries(composition)
      .map(([name, weight]) => `${name}: ${weight}`)
      .join(", ")} }`;
  return `[${composition
    .map(([weight, source]) => `[${weight}, ${sourceText(source)}]`)
    .join(", ")}]`;
}

/** A pair source written as the `classes` entry it came from, when it did. */
function sourceText(
  source:
    | { from: number; to: number }
    | ReadonlyArray<{ from: number; to: number }>,
): string {
  const hex = (n: number) => `0x${n.toString(16)}`;
  if (!Array.isArray(source)) {
    const range = source as { from: number; to: number };
    return `{ from: ${hex(range.from)}, to: ${hex(range.to)} }`;
  }
  const text = JSON.stringify(source);
  const name = (Object.keys(classes) as CharacterClass[]).find(
    (candidate) => JSON.stringify(classes[candidate]) === text,
  );
  if (name !== undefined) return `classes.${name}`;
  return `[${source.map((range) => `{ from: ${hex(range.from)}, to: ${hex(range.to)} }`).join(", ")}]`;
}

function literal(value: SuggestedValue): string {
  if (typeof value !== "object") return JSON.stringify(value);
  switch (value.type) {
    case "bigint":
      return `BigInt("${value.value}")`;
    case "date":
      return `new Date("${value.value}")`;
    case "number":
      return value.value === "-Infinity" ? "-Infinity" : value.value;
  }
}
