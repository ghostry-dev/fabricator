import { useId, useState } from "react";
import { niceStep, round } from "./numbers";
import {
  type Component,
  defaultShape,
  type Range,
  SHAPE_KINDS,
  type Shape,
} from "./types";

/**
 * A slider paired with a number box. The slider covers the range a reader
 * is likely to want; the box accepts anything, including values the slider
 * cannot reach (a `normal` mean outside the range is legitimate — it gives a
 * one-sided tail), and the slider pins to its end while that is so.
 *
 * `bounded` is for a parameter that has no meaning outside the slider's
 * range — a `triangular` mode past `max` — and holds the box to it too.
 *
 * `log` puts the slider on a log10 scale, for a parameter like `skew`'s
 * exponent where 0.1 and 10 are mirror images and 1 is the middle.
 */
export function Param(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  log?: boolean;
  positive?: boolean;
  bounded?: boolean;
  onChange: (value: number) => void;
}) {
  const { label, value, min, max, step, log, positive, bounded, onChange } =
    props;
  const id = useId();
  const toSlider = (v: number) => (log ? Math.log10(v) : v);
  const fromSlider = (v: number) => (log ? 10 ** v : v);
  const sliderMin = toSlider(min);
  const sliderMax = toSlider(max);
  const sliderStep = log ? (sliderMax - sliderMin) / 200 : step;

  return (
    <div className="dx-param">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={Math.min(sliderMax, Math.max(sliderMin, toSlider(value)))}
        onChange={(event) =>
          onChange(round(fromSlider(Number(event.target.value)), step))
        }
      />
      <NumberBox
        label={label}
        value={value}
        min={bounded ? min : undefined}
        max={bounded ? max : undefined}
        onCommit={(v) => (positive && !(v > 0) ? undefined : onChange(v))}
      />
    </div>
  );
}

/**
 * A number input that keeps its own draft while the reader types, so a
 * half-typed `-` or `1e` is not parsed, rejected and wiped mid-keystroke.
 * It commits whenever the draft parses to a finite number, and snaps back to
 * the current value on blur when it does not.
 *
 * The draft exists only while the box has focus. Unfocused, it shows `value`
 * directly, so nothing — a clamp, a range change, another control — can
 * leave it displaying a number the chart is not using.
 *
 * `min`/`max` make the bounds the input's own: the spinner stops at them,
 * and a typed value outside them is held as an uncommitted draft (styled
 * `:invalid`) rather than committed. Clamping on every keystroke instead
 * would break typing toward a value — `4` on the way to `450` is below a
 * `min` of `300` — so the clamp waits for blur. What the box shows and what
 * the chart uses therefore never disagree once the reader moves on.
 */
export function NumberBox(props: {
  label: string;
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  onCommit: (value: number) => void;
}) {
  const { label, value, min, max, onCommit } = props;
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const parse = (raw: string) => {
    const parsed = Number(raw);
    return raw.trim() !== "" && Number.isFinite(parsed) ? parsed : undefined;
  };
  const clamp = (v: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

  return (
    <input
      className="dx-number"
      type="number"
      step="any"
      min={min}
      max={max}
      aria-label={label}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parse(event.target.value);
        if (parsed !== undefined && clamp(parsed) === parsed) onCommit(parsed);
      }}
      onBlur={() => {
        const parsed = draft === undefined ? undefined : parse(draft);
        if (parsed !== undefined && clamp(parsed) !== parsed) {
          onCommit(clamp(parsed));
        }
        setDraft(undefined);
      }}
    />
  );
}

export function ShapeControls(props: {
  shape: Shape;
  range: Range;
  onChange: (shape: Shape) => void;
}) {
  const { shape, range, onChange } = props;
  const span = range.max - range.min;
  const step = niceStep(span / 200);

  switch (shape.kind) {
    case "uniform":
      return <p className="dx-hint">No parameters — every value is equally likely.</p>;

    case "logarithmic":
      return (
        <p className="dx-hint">
          No parameters — the range must start above zero.
        </p>
      );

    case "normal":
      return (
        <>
          <Param
            label="mean"
            value={shape.mean}
            min={range.min}
            max={range.max}
            step={step}
            onChange={(mean) => onChange({ ...shape, mean })}
          />
          <Param
            label="spread"
            value={shape.spread}
            min={step}
            max={span}
            step={step}
            positive
            onChange={(spread) => onChange({ ...shape, spread })}
          />
        </>
      );

    case "skew":
      return (
        <Param
          label="exponent"
          value={shape.exponent}
          min={0.1}
          max={10}
          step={0.01}
          log
          positive
          onChange={(exponent) => onChange({ ...shape, exponent })}
        />
      );

    case "triangular":
      return (
        <Param
          label="mode"
          value={shape.mode}
          min={range.min}
          max={range.max}
          step={step}
          bounded
          onChange={(mode) => onChange({ ...shape, mode })}
        />
      );
  }
}

/**
 * The picker every non-`multi` shape shares — the explorer's own variant
 * picker when unlocked, and each `multi` component's.
 */
export function ShapePicker(props: {
  label: string;
  kind: Shape["kind"];
  range: Range;
  onChange: (shape: Shape) => void;
}) {
  const { label, kind, range, onChange } = props;
  return (
    <select
      className="dx-select"
      aria-label={label}
      value={kind}
      onChange={(event) =>
        onChange(defaultShape(event.target.value as Shape["kind"], range))
      }
    >
      {SHAPE_KINDS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function ComponentsControls(props: {
  components: ReadonlyArray<Component>;
  range: Range;
  onChange: (components: ReadonlyArray<Component>) => void;
}) {
  const { components, range, onChange } = props;
  const replace = (index: number, next: Component) =>
    onChange(components.map((component, i) => (i === index ? next : component)));

  return (
    <div className="dx-components">
      {components.map((component, index) => (
        <fieldset key={index} className="dx-component">
          <legend>
            component {index + 1}
            <ShapePicker
              label={`component ${index + 1} kind`}
              kind={component.distribution.kind}
              range={range}
              onChange={(distribution) =>
                replace(index, { ...component, distribution })
              }
            />
            {components.length > 1 ? (
              <button
                type="button"
                className="dx-button dx-remove"
                aria-label={`Remove component ${index + 1}`}
                onClick={() => onChange(components.filter((_, i) => i !== index))}
              >
                ×
              </button>
            ) : null}
          </legend>
          <Param
            label="weight"
            value={component.weight}
            min={0}
            max={10}
            step={0.5}
            onChange={(weight) =>
              replace(index, { ...component, weight: Math.max(0, weight) })
            }
          />
          <ShapeControls
            shape={component.distribution}
            range={range}
            onChange={(distribution) =>
              replace(index, { ...component, distribution })
            }
          />
        </fieldset>
      ))}
      <button
        type="button"
        className="dx-button"
        onClick={() =>
          onChange([
            ...components,
            { weight: 1, distribution: defaultShape("normal", range) },
          ])
        }
      >
        + Add component
      </button>
    </div>
  );
}
