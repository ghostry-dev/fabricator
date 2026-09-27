/**
 * The nearest of 1, 2 or 5 times a power of ten — slider steps and axis
 * ticks that land on values a reader would type, so the snippet reads
 * `mean: 350` rather than `mean: 347.83`.
 */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / power;
  return (scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10) * power;
}

/**
 * Snap to `step` and drop the floating-point residue that snapping leaves
 * (`0.30000000000000004`), since the value is printed verbatim in the
 * snippet.
 */
export function round(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * Pinned to `en-US` so the prerendered labels and the hydrated ones are the
 * same string whatever locale the reader's browser reports.
 */
const standard = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function format(x: number): string {
  return Math.abs(x) >= 1e5 ? compact.format(x) : standard.format(x);
}
