import { normalCdf } from "@ghostry/fabricator/internal";
import type { Range, Shape, Shaping } from "./types";

/**
 * The exact probability density of `shaping` at `x`, over `range`. Each case
 * is the derivative of the inverse CDF `sampler` in
 * `pkg/fabricator/src/Distribution/index.ts` applies to a uniform draw, so
 * the curve is a statement about that code rather than about the textbook
 * distribution of the same name — `normal` is truncated to the range, and
 * `multi` shares one range across its components, because `sampler` does
 * both.
 *
 * `NaN` means "no density exists here" (a `logarithmic` range reaching zero,
 * a `multi` with no drawable component); the chart draws nothing for it, and
 * the library's own error explains why.
 */
export function density(shaping: Shaping, x: number, range: Range): number {
  if (shaping.kind === "multi") {
    const drawable = shaping.components.filter(({ weight }) => weight > 0);
    const total = drawable.reduce((sum, { weight }) => sum + weight, 0);
    if (total === 0) return Number.NaN;
    return drawable.reduce(
      (sum, { weight, distribution }) =>
        sum + (weight / total) * shapeDensity(distribution, x, range),
      0,
    );
  }
  return shapeDensity(shaping, x, range);
}

function shapeDensity(shape: Shape, x: number, range: Range): number {
  const { min, max } = range;
  const span = max - min;
  if (!(span > 0)) return Number.NaN;
  if (x < min || x > max) return 0;
  const t = (x - min) / span;

  switch (shape.kind) {
    case "uniform":
      return 1 / span;

    case "skew": {
      /**
       * `sampler` returns `u ** exponent`, so `P(T ≤ t) = t ** (1/exponent)`
       * and the density is its derivative — infinite at `min` whenever
       * `exponent > 1`, which is why the chart caps its y-axis.
       */
      const inverse = 1 / shape.exponent;
      return (inverse * t ** (inverse - 1)) / span;
    }

    case "triangular": {
      const split = Math.min(1, Math.max(0, (shape.mode - min) / span));
      const unit =
        t < split
          ? (2 * t) / split
          : split === 1
            ? 2
            : (2 * (1 - t)) / (1 - split);
      return unit / span;
    }

    case "normal": {
      const { mean, spread } = shape;
      if (!(spread > 0)) return Number.NaN;
      const mass =
        normalCdf((max - mean) / spread) - normalCdf((min - mean) / spread);
      const z = (x - mean) / spread;
      return Math.exp(-0.5 * z * z) / (Math.sqrt(2 * Math.PI) * spread * mass);
    }

    case "logarithmic":
      if (min <= 0) return Number.NaN;
      return 1 / (x * Math.log(max / min));
  }
}
