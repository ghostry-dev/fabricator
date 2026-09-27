import { useEffect, useRef, useState } from "react";
import { density } from "./density";
import { format, niceStep } from "./numbers";
import { fromAxis, toAxis } from "./sample";
import type { Range, Scale, Shape, Shaping } from "./types";

/**
 * The width the prerendered page assumes. Once hydrated the chart draws at
 * its real width instead (see `useWidth`), so on a phone the tick labels stay
 * at their set size rather than scaling down with the whole SVG.
 */
const INITIAL_WIDTH = 640;
const PAD = { top: 10, right: 14, bottom: 26, left: 14 };
const CURVE_POINTS = 240;

/**
 * One chart, both layers in one coordinate system: bars are the library's
 * real draws (`sample.ts`), the line is the exact density (`density.ts`).
 * Agreement between them is the point — it shows the formula describes what
 * the library does, and it shows the reader how noisy a few thousand draws
 * still are.
 *
 * `bars` is absent until the page hydrates, since the draws run client-side
 * only; the curve alone renders on the prerendered page.
 */
export function Chart(props: {
  shaping: Shaping;
  range: Range;
  scale: Scale;
  bars: ReadonlyArray<number> | undefined;
  compact: boolean;
  label: string;
}) {
  const { shaping, range, scale, bars, compact, label } = props;
  const [ref, width] = useWidth();
  const height = compact ? 150 : 240;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const lower = toAxis(range.min, scale);
  const upper = toAxis(range.max, scale);
  const valid = Number.isFinite(lower) && Number.isFinite(upper) && upper > lower;

  /**
   * Density per unit of axis, not per unit of `x`: on a log axis a bin
   * spanning `ds` covers `dx = x·ds`, so the curve is scaled by `x` to stay
   * comparable with bars binned in that same space.
   */
  const curve = valid
    ? Array.from({ length: CURVE_POINTS + 1 }, (_, i) => {
        const s = lower + ((upper - lower) * i) / CURVE_POINTS;
        const x = fromAxis(s, scale);
        const jacobian = scale === "log" ? x : 1;
        return { s, y: density(shaping, x, range) * jacobian };
      })
    : [];

  /**
   * The ceiling ignores the curve's two endpoints: `skew` with an exponent
   * above 1 is infinite exactly at `min`, and letting that decide the scale
   * would flatten everything else to the baseline. What pokes above the
   * ceiling is clipped rather than rescaled.
   */
  const interior = curve.slice(1, -1).map(({ y }) => y);
  const peak = Math.max(
    0,
    ...interior.filter(Number.isFinite),
    ...(bars ?? []).filter(Number.isFinite),
  );
  const ceiling = peak > 0 ? peak * 1.08 : 1;

  const xOf = (s: number) =>
    PAD.left + ((s - lower) / (upper - lower)) * plotWidth;
  const yOf = (y: number) => PAD.top + plotHeight * (1 - y / ceiling);

  const path = curve
    .filter(({ y }) => Number.isFinite(y))
    .map(
      ({ s, y }, i) =>
        `${i === 0 ? "M" : "L"}${xOf(s).toFixed(2)},${yOf(y).toFixed(2)}`,
    )
    .join("");

  const barWidth = bars ? plotWidth / bars.length : 0;
  const clipId = `clip-${label.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <svg
      ref={ref}
      className="dx-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={PAD.top} width={width} height={plotHeight} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {bars?.map((y, i) =>
          y > 0 ? (
            <rect
              key={i}
              className="dx-bar"
              x={PAD.left + i * barWidth + 0.5}
              width={Math.max(0, barWidth - 1)}
              y={yOf(Math.min(y, ceiling))}
              height={PAD.top + plotHeight - yOf(Math.min(y, ceiling))}
            />
          ) : null,
        )}
        {valid
          ? markers(shaping).map((x, i) =>
              x >= range.min && x <= range.max ? (
                <line
                  key={i}
                  className="dx-marker"
                  x1={xOf(toAxis(x, scale))}
                  x2={xOf(toAxis(x, scale))}
                  y1={PAD.top}
                  y2={PAD.top + plotHeight}
                />
              ) : null,
            )
          : null}
        {path ? <path className="dx-curve" d={path} /> : null}
      </g>
      <line
        className="dx-axis"
        x1={PAD.left}
        x2={width - PAD.right}
        y1={PAD.top + plotHeight}
        y2={PAD.top + plotHeight}
      />
      {valid
        ? ticks(range, scale).map((x, i, all) => (
            <text
              key={i}
              className="dx-tick"
              x={xOf(toAxis(x, scale))}
              y={height - 8}
              textAnchor={
                i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"
              }
            >
              {format(x)}
            </text>
          ))
        : null}
    </svg>
  );
}

/**
 * Where the parameters the reader is dragging sit on the axis — a `normal`'s
 * `mean`, a `triangular`'s `mode`, and the same for each `multi` component —
 * so moving a slider visibly moves something even where the shape itself
 * barely changes.
 */
function markers(shaping: Shaping): ReadonlyArray<number> {
  const of = (shape: Shape): ReadonlyArray<number> =>
    shape.kind === "normal"
      ? [shape.mean]
      : shape.kind === "triangular"
        ? [shape.mode]
        : [];
  return shaping.kind === "multi"
    ? shaping.components
        .filter(({ weight }) => weight > 0)
        .flatMap(({ distribution }) => of(distribution))
    : of(shaping);
}

/**
 * Both ends always, since they are the bounds the reader typed. Between
 * them, round multiples on a linear axis — `250`, not `250.75` when `min` is
 * `1` — and powers of ten on a log one, the values a log axis is read by.
 * Inner ticks too close to an end are dropped so labels never collide.
 */
function ticks(range: Range, scale: Scale): ReadonlyArray<number> {
  const { min, max } = range;
  const inner: number[] = [];
  if (scale === "linear") {
    const step = niceStep((max - min) / 4);
    for (let x = Math.ceil(min / step) * step; x < max; x += step) {
      inner.push(x);
    }
  } else {
    for (
      let power = Math.ceil(Math.log10(min));
      power <= Math.floor(Math.log10(max));
      power++
    ) {
      inner.push(10 ** power);
    }
  }
  const lower = toAxis(min, scale);
  const upper = toAxis(max, scale);
  const gap = (upper - lower) * 0.1;
  const spaced = inner.filter(
    (x) => toAxis(x, scale) - lower > gap && upper - toAxis(x, scale) > gap,
  );
  return [min, ...spaced, max];
}

function useWidth() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(INITIAL_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.round(entry?.contentRect.width ?? 0);
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
