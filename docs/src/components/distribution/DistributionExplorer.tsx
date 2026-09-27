"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Chart } from "./Chart";
import {
  ComponentsControls,
  NumberBox,
  ShapeControls,
} from "./Controls";
import { format } from "./numbers";
import { draw, histogram } from "./sample";
import {
  defaultShaping,
  fitShaping,
  type Kind,
  KINDS,
  type Range,
  type Scale,
  type Shaping,
} from "./types";
import "./explorer.css";

/**
 * An interactive `distribution` playground for the Distributions guide.
 *
 * The full form (the default) is the page's main explorer: range inputs, a
 * variant picker, the variant's parameters and a copyable `T.number.whereby`
 * snippet. `compact` is the per-variant preview under each section: locked
 * to the variant it starts on, over a fixed range, with only that variant's
 * parameters.
 *
 * `distribution` is the starting shape, or just a variant name to start from
 * the library's defaults for it over the range.
 */
export function DistributionExplorer(props: {
  compact?: boolean;
  min?: number;
  max?: number;
  distribution?: Shaping | Kind;
  scale?: Scale;
}) {
  const compact = props.compact ?? false;
  const [range, setRange] = useState<Range>({
    min: props.min ?? 0,
    max: props.max ?? 1000,
  });
  const [chosen, setShaping] = useState<Shaping>(() =>
    typeof props.distribution === "object"
      ? props.distribution
      : defaultShaping(props.distribution ?? "normal", range),
  );

  /**
   * What the reader set, held inside the current range (see `fitShaping`).
   * Everything below reads this, never `chosen` — memoized, since
   * `useDeferredValue` and the draws key on its identity.
   */
  const shaping = useMemo(() => fitShaping(chosen, range), [chosen, range]);
  /**
   * A log axis exists only over a range starting above zero, so outside one
   * the toggle is not rendered at all. The reader's choice is kept rather
   * than reset, and applies again once `min` is back above zero.
   */
  const [preferredScale, setScale] = useState<Scale>(props.scale ?? "linear");
  const scale: Scale = range.min > 0 ? preferredScale : "linear";

  /**
   * Starts at a fixed instant rather than the wall clock so that every
   * reader's first histogram is the same one. "Redraw" moves it forward.
   */
  const [clock, setClock] = useState(0);

  /**
   * The draws run in the browser only. This page is prerendered, and
   * drawing during that render would both run the library at build time for
   * nothing and risk a hydration mismatch on a float's last digit.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  /**
   * The chart trails the controls by a frame under load rather than making a
   * dragged slider wait for a few thousand draws per tick.
   */
  const deferredRange = useDeferredValue(range);
  const deferredShaping = useDeferredValue(shaping);
  const count = compact ? 2000 : 5000;
  const bins = compact ? 32 : 48;

  const draws = useMemo(
    () =>
      hydrated
        ? draw(deferredShaping, deferredRange, count, clock)
        : undefined,
    [hydrated, deferredShaping, deferredRange, count, clock],
  );
  const bars = useMemo(
    () =>
      draws?.ok ? histogram(draws.values, deferredRange, scale, bins) : undefined,
    [draws, deferredRange, scale, bins],
  );

  const label = `${shaping.kind} distribution over ${format(range.min)} to ${format(range.max)}${compact ? " (preview)" : ""}`;

  return (
    <div className={compact ? "dx dx-compact" : "dx"}>
      <Chart
        shaping={deferredShaping}
        range={deferredRange}
        scale={scale}
        bars={bars}
        compact={compact}
        label={label}
      />

      {draws && !draws.ok ? (
        <p className="dx-error" role="alert">
          {draws.message}
        </p>
      ) : null}

      <div className="dx-controls">
        {compact ? null : (
          <div className="dx-row">
            <label className="dx-field">
              <span>kind</span>
              <select
                className="dx-select"
                value={shaping.kind}
                onChange={(event) =>
                  setShaping(defaultShaping(event.target.value as Kind, range))
                }
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="dx-field">
              <span>min</span>
              <NumberBox
                label="min"
                value={range.min}
                onCommit={(min) => setRange({ ...range, min })}
              />
            </label>
            <label className="dx-field">
              <span>max</span>
              <NumberBox
                label="max"
                value={range.max}
                onCommit={(max) => setRange({ ...range, max })}
              />
            </label>
          </div>
        )}

        {shaping.kind === "multi" ? (
          <ComponentsControls
            components={shaping.components}
            range={range}
            onChange={(components) => setShaping({ kind: "multi", components })}
          />
        ) : (
          <ShapeControls shape={shaping} range={range} onChange={setShaping} />
        )}

        <div className="dx-row dx-actions">
          <button
            type="button"
            className="dx-button"
            onClick={() => setClock((current) => current + 1)}
          >
            Redraw
          </button>
          {range.min > 0 ? (
            <label className="dx-toggle">
              <input
                type="checkbox"
                checked={scale === "log"}
                onChange={(event) =>
                  setScale(event.target.checked ? "log" : "linear")
                }
              />
              log axis
            </label>
          ) : null}
          <span className="dx-legend">
            <span className="dx-swatch dx-swatch-bar" /> {count.toLocaleString("en-US")} draws
            <span className="dx-swatch dx-swatch-curve" /> exact density
          </span>
        </div>
      </div>

      {compact ? null : <Snippet range={range} shaping={shaping} />}
    </div>
  );
}

function Snippet(props: { range: Range; shaping: Shaping }) {
  const code = snippet(props.range, props.shaping);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="dx-snippet">
      <pre>
        <code>{code}</code>
      </pre>
      <button
        type="button"
        className="dx-button dx-copy"
        onClick={() =>
          navigator.clipboard
            ?.writeText(code)
            .then(() => setCopied(true))
            .catch(() => undefined)
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * The call a reader would write for what is on screen, formatted the way the
 * guide's own examples are: one short line per shape, and a `multi` broken
 * out one component per line.
 */
function snippet(range: Range, shaping: Shaping): string {
  const distribution =
    shaping.kind === "multi"
      ? [
          "{",
          '    kind: "multi",',
          "    components: [",
          ...shaping.components.map(
            ({ weight, distribution }) =>
              `      { weight: ${weight}, distribution: ${inline(distribution)} },`,
          ),
          "    ],",
          "  }",
        ].join("\n")
      : inline(shaping);
  return [
    "T.number.whereby({",
    `  min: ${range.min},`,
    `  max: ${range.max},`,
    `  distribution: ${distribution},`,
    "});",
  ].join("\n");
}

function inline(shaping: Shaping): string {
  const fields = Object.entries(shaping).map(([key, value]) =>
    typeof value === "string" ? `${key}: "${value}"` : `${key}: ${value}`,
  );
  return `{ ${fields.join(", ")} }`;
}
