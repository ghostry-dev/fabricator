import { initialize } from "@ghostry/fabricator";
import type { Range, Scale, Shaping } from "./types";

export type Draws =
  | { ok: true; values: ReadonlyArray<number> }
  | { ok: false; message: string };

/**
 * `count` values from the real library, built the way a reader would write
 * it — so the histogram is what `T.number.whereby` actually does, and a
 * configuration the library rejects surfaces its own error rather than a
 * message the docs made up.
 *
 * `clock` pins the instance, and with it every draw: the same `clock` feeds
 * the same underlying uniforms through whatever distribution is chosen, so
 * dragging a slider morphs one sample instead of reshuffling it on every
 * tick. A new `clock` is what "Redraw" means.
 */
export function draw(
  shaping: Shaping,
  range: Range,
  count: number,
  clock: number,
): Draws {
  try {
    const { T, Fabricator } = initialize({ clock: new Date(clock) });
    const values = new Fabricator(
      T.array(
        T.number.whereby({
          min: range.min,
          max: range.max,
          distribution: shaping,
        }),
      ).whereby({ length: { min: count, max: count } }),
    ).fabricate();
    return { ok: true, values };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Position along the x-axis. Bins, ticks and the curve all work in this
 * space, so a `log` axis gets log-width bins — equal-looking bars for equal
 * ratios, which is the only way a log-uniform histogram comes out flat.
 */
export function toAxis(x: number, scale: Scale): number {
  return scale === "log" ? Math.log(x) : x;
}

export function fromAxis(s: number, scale: Scale): number {
  return scale === "log" ? Math.exp(s) : s;
}

/**
 * Bar heights as densities in axis space — the fraction of draws in a bin
 * divided by its width — so they sit on the same vertical scale as the
 * curve, which the chart converts to axis space the same way.
 */
export function histogram(
  values: ReadonlyArray<number>,
  range: Range,
  scale: Scale,
  bins: number,
): ReadonlyArray<number> {
  const lower = toAxis(range.min, scale);
  const upper = toAxis(range.max, scale);
  const width = (upper - lower) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const value of values) {
    const index = Math.floor((toAxis(value, scale) - lower) / width);
    counts[Math.min(bins - 1, Math.max(0, index))]! += 1;
  }
  return counts.map((count) => count / (values.length * width));
}
