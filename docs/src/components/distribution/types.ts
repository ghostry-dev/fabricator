import { round } from "./numbers";

/**
 * The explorer's own copy of the `distribution` field's shape. The library
 * does not export its `Distribution` type from `.`, and does not need to: the
 * field is structurally typed, so these literals are accepted by
 * `T.number.whereby` as they are — which is exactly what the guide tells
 * readers, and `sample.ts` passing them straight through checks it.
 *
 * Unlike the library's, every parameter here is required: a slider always has
 * a value, and the generated snippet shows the value the reader chose rather
 * than leaving them to remember a default.
 */
export type Shape =
  | { kind: "uniform" }
  | { kind: "normal"; mean: number; spread: number }
  | { kind: "skew"; exponent: number }
  | { kind: "triangular"; mode: number }
  | { kind: "logarithmic" };

/**
 * A `multi` component draws from one {@link Shape}, never another `multi` —
 * the library allows nesting, but a nested blend is the same blend with its
 * weights multiplied out, so the explorer does not offer it.
 */
export type Component = { weight: number; distribution: Shape };

export type Blend = { kind: "multi"; components: ReadonlyArray<Component> };

export type Shaping = Shape | Blend;

export type Kind = Shaping["kind"];

export type Range = { min: number; max: number };

/**
 * Where the x-axis puts values. `log` is what makes a `logarithmic`
 * distribution read as its definition — flat across orders of magnitude —
 * where a linear axis shows the same draws piled up against `min`.
 */
export type Scale = "linear" | "log";

export const KINDS: ReadonlyArray<Kind> = [
  "uniform",
  "normal",
  "skew",
  "triangular",
  "logarithmic",
  "multi",
];

export const SHAPE_KINDS: ReadonlyArray<Shape["kind"]> = [
  "uniform",
  "normal",
  "skew",
  "triangular",
  "logarithmic",
];

/**
 * A fresh shape of `kind`, with the parameters the library would default to
 * over `range` — so switching variants starts from the shape the reader would
 * get by writing `{ kind }` alone. Rounded to two decimals, because the
 * snippet prints them: `spread: 166.67` rather than `166.66666666666666`.
 */
export function defaultShape(kind: Shape["kind"], range: Range): Shape {
  const center = round((range.min + range.max) / 2, 0.01);
  const span = range.max - range.min;
  switch (kind) {
    case "uniform":
      return { kind };
    case "normal":
      return { kind, mean: center, spread: round(span / 6, 0.01) };
    case "skew":
      return { kind, exponent: 2 };
    case "triangular":
      return { kind, mode: center };
    case "logarithmic":
      return { kind };
  }
}

/**
 * `multi`'s starting point is the guide's own example scaled to `range`: a
 * 3:1 blend of two normals at a quarter and three quarters of the span, which
 * shows two distinct peaks of visibly different heights.
 */
export function defaultShaping(kind: Kind, range: Range): Shaping {
  if (kind !== "multi") return defaultShape(kind, range);
  const span = range.max - range.min;
  return {
    kind,
    components: [
      {
        weight: 3,
        distribution: {
          kind: "normal",
          mean: range.min + span * 0.25,
          spread: span / 16,
        },
      },
      {
        weight: 1,
        distribution: {
          kind: "normal",
          mean: range.min + span * 0.75,
          spread: span / 16,
        },
      },
    ],
  };
}

/**
 * `shaping` with every `triangular` mode pulled back inside `range` — what
 * the explorer shows, draws and prints. It is applied on read rather than
 * written back when the range changes, because `min`/`max` commit on every
 * keystroke: typing a new `max` of `800` passes through `8`, and writing the
 * clamp back would leave the mode at 8. Kept as a view, the mode the reader
 * set comes back once the range allows it again, and the bounded mode box
 * never displays a value the chart is not using.
 *
 * An empty or inverted range is left alone; the library's own error already
 * explains it, and clamping into it would scramble the mode for nothing.
 * Other parameters are never touched: a `normal` mean outside the range is
 * meaningful, a one-sided tail.
 */
export function fitShaping(shaping: Shaping, range: Range): Shaping {
  if (!(range.min < range.max)) return shaping;
  const fit = (shape: Shape): Shape =>
    shape.kind === "triangular"
      ? { ...shape, mode: Math.min(range.max, Math.max(range.min, shape.mode)) }
      : shape;
  return shaping.kind === "multi"
    ? {
        ...shaping,
        components: shaping.components.map((component) => ({
          ...component,
          distribution: fit(component.distribution),
        })),
      }
    : fit(shaping);
}
