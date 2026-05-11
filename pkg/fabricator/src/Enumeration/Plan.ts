import { drawableOutcomes, isDrawable } from "../Distribution";
import { FabricatorError } from "../Error";
import type { Kind as SchemaKind } from "../Primitive";
import { outcomes as booleanOutcomes } from "../Primitive/boolean/Outcomes";
import { outcomes as nullableOutcomes } from "../Primitive/nullable/Outcomes";
import { outcomes as nullishOutcomes } from "../Primitive/nullish/Outcomes";
import { outcomes as omittableOutcomes } from "../Primitive/object/omittable/Outcomes";
import { outcomes as optionalOutcomes } from "../Primitive/object/optional/Outcomes";
import { outcomes as undefinableOutcomes } from "../Primitive/undefinable/Outcomes";
import { Children, Fixed, Kind, Meta, Omitted } from "../Types";
import { never } from "../Utility/Core";
import type { Axis, Orderer, Pin, Resolvable, Strategy } from "./Types";

/** A width-1 axis: nothing to pin, let the node fabricate normally. */
function leaf(): Axis {
  return { width: BigInt(1), at: () => undefined };
}

/**
 * One outcome of a sum node (`choice`, or a presence wrapper's roll):
 * a literal (`null`, `undefined`, `Omitted`) or a nested axis (the
 * wrapped/chosen schema).
 */
type Branch =
  | { readonly kind: "literal"; readonly value: unknown }
  | { readonly kind: "delegate"; readonly axis: Axis; readonly index: number };

function literal(value: unknown): Branch {
  return { kind: "literal", value };
}

/**
 * `index` is the index into the uncompacted `[Children]` that
 * `resolve` must use — not this branch's position in the compacted
 * `branches` array. Compacting a `choice` without it fabricates the
 * wrong option with no error.
 */
function delegate(axis: Axis, index: number): Branch {
  return { kind: "delegate", axis, index };
}

/**
 * Mutually-exclusive branches as one axis — `choice`'s options, or a
 * presence wrapper's outcomes (`null`/`undefined`/`Omitted` alongside
 * "present"). Always totals widths, regardless of `Strategy`: only
 * one branch is realized per instance, so unlike a product node their
 * costs add rather than overlap (see CLAUDE.md's "sum vs product"
 * note). A literal contributes `{ value }`; a delegate wraps the
 * child's pin in `{ branch, inner }`.
 */
function sumAxis(branches: ReadonlyArray<Branch>): Axis {
  const width = branches.reduce(
    (total, branch) =>
      total + (branch.kind === "literal" ? BigInt(1) : branch.axis.width),
    BigInt(0),
  );

  function at(index: bigint): Pin {
    let remaining = index;

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i]!;
      const branchWidth =
        branch.kind === "literal" ? BigInt(1) : branch.axis.width;

      if (remaining < branchWidth) {
        return branch.kind === "literal"
          ? { value: branch.value }
          : { branch: branch.index, inner: branch.axis.at(remaining) };
      }

      remaining -= branchWidth;
    }

    throw new FabricatorError.EnumerationIndexError(index, width);
  }

  return { width, at };
}

/**
 * Independently-realized axes as one axis — every child is present in
 * every instance (`object`'s fields, `tuple`'s slots), so they exhaust
 * in parallel rather than adding.
 *
 * `"product"`: width is the product of every child's width;
 * `at(index)` mixed-radix decodes into one distinct index per child,
 * so every combination is visited exactly once.
 *
 * `"cycle"`: width is the *widest* child's width; `at(index)` hands
 * the same raw index to every child unchanged. Relies entirely on
 * each child axis already being its own width-`>1` node wrapped by
 * `plan()` — a narrower child's wrapper reduces that index modulo its
 * own width and permutes it, so this function never needs to know
 * which children are narrower or compute any modulo itself.
 */
function productAxis<$Pin extends Pin>(
  strategy: Strategy,
  axes: ReadonlyArray<Axis>,
  assemble: (pins: ReadonlyArray<Pin>) => $Pin,
): Axis {
  switch (strategy) {
    case "cycle": {
      const width = axes.reduce(
        (widest, axis) => (axis.width > widest ? axis.width : widest),
        BigInt(1),
      );

      return {
        width,
        at: (index) => assemble(axes.map((axis) => axis.at(index))),
      };
    }

    case "product": {
      const width = axes.reduce((total, axis) => total * axis.width, BigInt(1));

      function at(index: bigint): $Pin {
        const pins: Pin[] = new Array(axes.length);
        let remaining = index;

        for (let i = axes.length - 1; i >= 0; i--) {
          const axis = axes[i]!;
          pins[i] = axis.at(remaining % axis.width);
          remaining /= axis.width;
        }

        return assemble(pins);
      }

      return { width, at };
    }
  }
}

type Planning =
  | { strategy: "product"; orderer?: Orderer | undefined }
  | { strategy: "cycle"; orderer: Orderer };

/**
 * Enumerable shape of a built Fabricator tree: how many distinct
 * combinations, and how to reproduce the `index`-th as a `Pin`.
 * Exhaustive kind dispatch lives in `axisFor`; this wrapper applies
 * `"cycle"` permutation uniformly, once, to whatever axis `axisFor`
 * computes — so every recursive call (`axisFor` cases call back into
 * `plan`, never `axisFor` directly) gets its *own* independent
 * permutation, decorrelating equal-width siblings without any
 * per-kind case needing to know strategy beyond `Strategy`'s own
 * widen/narrow rules.
 *
 * Width is a function of schema shape *and* weights: a zero-weighted
 * outcome is not fabricable, so `axisFor` filters through `isDrawable`
 * / `drawableOutcomes` rather than treating the declared branch set as
 * the axis. Without that, `coverage()` would pin a value `fabricate()`
 * can never produce. Defaulting of unspecified keyed weights goes
 * through `drawableOutcomes` so the `?? 1` baseline is never
 * re-implemented here.
 *
 * Skipped for width-1 axes (nothing to permute) and under `"product"`
 * (mixed-radix decode already visits every combination, so permuting
 * would only reorder identical output — see `Orderer`). `orders` is
 * therefore only ever read when `strategy === "cycle"` and is safe to
 * omit otherwise.
 */
export function plan(node: Resolvable, planning: Planning): Axis {
  const axis = axisFor(node, planning);

  switch (planning.strategy) {
    case "product":
      return axis;

    case "cycle": {
      if (axis.width <= BigInt(1)) return axis;

      const order = planning.orderer(axis.width);

      return {
        width: axis.width,
        at: (index) => axis.at(order[Number(index % axis.width)]!),
      };
    }
  }
}

function axisFor(node: Resolvable, planning: Planning): Axis {
  /**
   * An `.as(...)`-supplied producer replaces a kind's own schema-driven
   * logic before anything else runs (see every kind's `Fabricator.ts`),
   * so its value set is opaque regardless of what `[Meta]` otherwise
   * says.
   */
  if (node[Meta]?.produce) return leaf();

  const kind: SchemaKind = node[Kind];

  switch (kind) {
    case "enum": {
      const items: ReadonlyArray<readonly [number, unknown]> = node[Meta].items;
      const drawable = items.filter(([weight]) => isDrawable(weight));

      return {
        width: BigInt(drawable.length),
        at: (index) => ({ value: drawable[Number(index)]![1] }),
      };
    }

    case "boolean": {
      const names = drawableOutcomes(booleanOutcomes, node[Meta].weights);

      return {
        width: BigInt(names.length),
        at: (index) => ({ value: names[Number(index)] === "true" }),
      };
    }

    case "choice": {
      const items: ReadonlyArray<readonly [number, unknown]> = node[Meta].items;
      const options: ReadonlyArray<Resolvable> = node[Children];
      const branches: Branch[] = [];

      for (let i = 0; i < items.length; i++) {
        if (!isDrawable(items[i]![0])) continue;
        branches.push(delegate(plan(options[i]!, planning), i));
      }

      return sumAxis(branches);
    }

    case "nullable": {
      return sumAxis(
        drawableOutcomes(nullableOutcomes, node[Meta].weights).map(
          (name, i) => {
            switch (name) {
              case "null":
                return literal(null);
              case "value":
                return delegate(plan(node[Children], planning), i);
            }
          },
        ),
      );
    }

    case "nullish": {
      return sumAxis(
        drawableOutcomes(nullishOutcomes, node[Meta].weights).map((name, i) => {
          switch (name) {
            case "null":
              return literal(null);
            case "undefined":
              return literal(undefined);
            case "value":
              return delegate(plan(node[Children], planning), i);
          }
        }),
      );
    }

    case "undefinable": {
      return sumAxis(
        drawableOutcomes(undefinableOutcomes, node[Meta].weights).map(
          (name, i) => {
            switch (name) {
              case "undefined":
                return literal(undefined);
              case "value":
                return delegate(plan(node[Children], planning), i);
            }
          },
        ),
      );
    }

    case "object.omittable": {
      return sumAxis(
        drawableOutcomes(omittableOutcomes, node[Meta].weights).map(
          (name, i) => {
            switch (name) {
              case "omitted":
                return literal(Omitted);
              case "value":
                return delegate(plan(node[Children], planning), i);
            }
          },
        ),
      );
    }

    case "object.optional": {
      return sumAxis(
        drawableOutcomes(optionalOutcomes, node[Meta].weights).map(
          (name, i) => {
            switch (name) {
              case "omitted":
                return literal(Omitted);
              case "undefined":
                return literal(undefined);
              case "value":
                return delegate(plan(node[Children], planning), i);
            }
          },
        ),
      );
    }

    case "tuple": {
      const elements: ReadonlyArray<Resolvable> = node[Children];
      const axes = elements.map((element) => plan(element, planning));

      return productAxis(planning.strategy, axes, (slots) => ({ slots }));
    }

    case "object": {
      const definition: Record<string, any> = node[Meta].definition;
      const fields: Record<string, Resolvable> = node[Children];
      const keys: string[] = [];
      const axes: Axis[] = [];

      for (const key of Object.keys(fields)) {
        const fieldSchema = definition[key];
        const fieldFabricator = fields[key]!;

        /**
         * Pinned by `.override()` — read off the *parent's* raw schema
         * entry. `Constructor.ts` still dispatches an overridden field
         * (to detect via the built `[Kind]` whether it was
         * `object.compute`) but the built Fabricator itself no longer
         * shows `[Fixed]` on its own `[Meta]`.
         */
        if (fieldSchema && Fixed in fieldSchema) {
          keys.push(key);
          axes.push(leaf());
          continue;
        }

        /**
         * Phase-2 derived from the rest of the object (see
         * `object/Fabricator.ts`) — stays out of the pin entirely, not
         * even as a width-1 entry, so it can never be mistaken for an
         * overridable field.
         */
        if (fieldFabricator[Kind] === "object.compute") continue;

        keys.push(key);
        axes.push(plan(fieldFabricator, planning));
      }

      return productAxis(planning.strategy, axes, (pins) => {
        const fieldsPin: Record<string, Pin> = {};
        for (let i = 0; i < keys.length; i++) fieldsPin[keys[i]!] = pins[i];
        return { fields: fieldsPin };
      });
    }

    /**
     * Everything else has no fixed, finite value set — its value is
     * drawn rather than chosen, so it stays width 1 and is sampled
     * normally per instance. `object.compute` and `recursive.self` are
     * never planned directly in practice (the `object` case above
     * filters compute fields out before recursing into them, and
     * `self` only ever appears mid-expansion inside `fabricate()`,
     * never as a build-time node), but still need a case here so this
     * switch stays exhaustive.
     */
    case "always":
    case "null":
    case "undefined":
    case "string":
    case "number":
    case "bigint":
    case "date":
    case "symbol":
    case "opaque":
    case "array":
    case "record":
    case "recursive":
    case "recursive.self":
    case "object.compute":
      return leaf();

    default:
      return never(kind);
  }
}

/**
 * Turn a `{ fields }` pin into the `Override` map
 * `object.Fabricator`'s `fabricate(overrides)` expects. A field with
 * no pin is omitted, letting it fabricate naturally. A nested
 * `object` field becomes a nested override map rather than a fully
 * resolved value — the outer `.fabricate()` already cascades into a
 * nested object override (preserving deep-merge and compute-field
 * behavior), so resolving it here first would only double the work.
 * Every other pinned field is fully resolved via `resolve`: a
 * non-object field's override is always a wholesale replacement.
 */
function toOverride(
  fieldsPin: Record<string, Pin>,
  fields: Record<string, any>,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  for (const key of Object.keys(fieldsPin)) {
    const pin = fieldsPin[key];
    if (pin === undefined) continue;

    const fieldFabricator = fields[key]!;

    overrides[key] =
      fieldFabricator[Kind] === "object"
        ? toOverride(
            (pin as { fields: Record<string, Pin> }).fields,
            fieldFabricator[Children],
          )
        : resolve(fieldFabricator, pin);
  }

  return overrides;
}

/**
 * Reproduce the value a `Pin` describes against the built Fabricator
 * it was planned from. `pin === undefined` is universal — `plan()`
 * gave this node a width-1 axis, so there is nothing to pin and it
 * fabricates normally. Every other case only arises for kinds
 * `plan()` treats as enumerable axes, so this switch does not need to
 * be exhaustive the way `plan()`'s is.
 */
export function resolve(node: Resolvable, pin: Pin): unknown {
  if (pin === undefined) return node.fabricate();

  const kind: SchemaKind = node[Kind];

  switch (kind) {
    case "enum":
    case "boolean":
      return (pin as { value: unknown }).value;

    case "choice": {
      const p = pin as { branch: number; inner: Pin };
      const options: ReadonlyArray<Resolvable> = node[Children];
      return resolve(options[p.branch]!, p.inner);
    }

    case "nullable":
    case "nullish":
    case "undefinable":
    case "object.omittable":
    case "object.optional": {
      /**
       * Wrappers discriminate on `"value" in pin` and recurse into the
       * single wrapped `[Children]` — they never read `p.branch`. That
       * is why compacting a zero-weighted absence outcome is safe
       * here, unlike `choice`, which indexes `[Children]` by the
       * original option position.
       */
      if ("value" in pin) return pin.value;

      const p = pin as { branch: number; inner: Pin };
      return resolve(node[Children], p.inner);
    }

    case "tuple": {
      const p = pin as { slots: ReadonlyArray<Pin> };
      const elements: ReadonlyArray<Resolvable> = node[Children];
      return elements.map((element, i) => resolve(element, p.slots[i]));
    }

    case "object": {
      const p = pin as { fields: Record<string, Pin> };
      const overrides = toOverride(p.fields, node[Children]);
      return node.fabricate(overrides, { validate: false });
    }

    default:
      throw new FabricatorError.UnpinnableKindError(kind);
  }
}
