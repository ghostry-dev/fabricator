/**
 * Every error this library throws is a named subclass of
 * {@link FabricatorError}, kept in one dependency-free module: `instanceof
 * FabricatorError` catches everything the library raises, and no error
 * definition can pull a primitive's module graph into an unrelated import.
 *
 * Kind tags are plain `string`, not the `Kind` union from `Primitive/index.ts`
 * — that second reason, and because several of these errors exist precisely
 * because the kind in hand was _not_ a member of it.
 *
 * Context is `public readonly` constructor parameters, but the message still
 * stands on its own: a consumer reading only `.message` should not need a field
 * to understand the failure. Fields are for programmatic access, and for detail
 * too bulky to inline.
 */

/**
 * Base error class from which more specific errors inherit.
 */
export abstract class FabricatorError extends Error {
  constructor() {
    super();
    this.name = "FabricatorError";
  }
}

export namespace FabricatorError {
  /**
   * The phase a failure was raised from, for the errors reachable both while
   * building a Fabricator (`Fabricator/Constructor.ts`'s `make`) and while
   * converting to an external schema (an adapter's own `convert`).
   */
  export type Phase = "construction" | "adaptation";

  function phrase(during: Phase): string {
    switch (during) {
      case "construction":
        return "building a Fabricator";
      case "adaptation":
        return "converting to an external schema";
    }
  }

  /**
   * `initialize({ limits: { combinatorial } })` when the configured limit could
   * never be a meaningful instance count.
   */
  export class InvalidCombinatorialLimitError extends FabricatorError {
    constructor(
      /**
       * The rejected limit, as resolved — so an explicit `0`, a fractional
       * number, and a value past `Number.MAX_SAFE_INTEGER` are all
       * distinguishable after the fact.
       */
      public readonly limit: unknown,
    ) {
      super();
      this.name = "InvalidCombinatorialLimitError";
      this.message =
        `initialize({ limits: { combinatorial } }) requires a positive safe ` +
        `integer; received ${String(limit)}.`;
    }
  }

  /**
   * `initialize({ attribution: { kind: "rooted", root } })` when `root` is not
   * an absolute path or a `file://` URL. A relative root can never prefix a
   * resolved caller file, so `relativize` would leave every file unchanged —
   * the option would look configured while silently doing nothing. Thrown
   * eagerly at `initialize()`, not deferred to wherever that would first become
   * observable.
   */
  export class InvalidAttributionRootError extends FabricatorError {
    constructor(
      /**
       * The rejected root, as given.
       */
      public readonly root: string,
    ) {
      super();
      this.name = "InvalidAttributionRootError";
      this.message =
        'initialize({ attribution: { kind: "rooted", root } }) requires an ' +
        `absolute path or a "file://" URL; received "${root}".`;
    }
  }

  /**
   * A `self` placeholder resolved with no `T.recursive` expanding around it —
   * only reachable by holding a `self` reference outside the `T.recursive(...)`
   * callback it was handed to.
   */
  export class DetachedSelfError extends FabricatorError {
    constructor(
      /**
       * Which walk hit the detached reference.
       */
      public readonly during: Phase,
    ) {
      super();
      this.name = "DetachedSelfError";
      this.message =
        "`self` was used outside any active `T.recursive` while " +
        `${phrase(during)} — it can only appear inside the body (or terminal) ` +
        "passed to `T.recursive(...)`, and a `self` captured out of that " +
        "callback cannot be reused elsewhere.";
    }
  }

  /**
   * `T.recursive(body).whereby({ depth })` with no `terminal`, when `body` has
   * a `self` that is not behind a kind that can stop recursing — a required
   * object field, a tuple slot, the body itself, or a `choice` whose every
   * option still contains `self`. Thrown at `.whereby()`, not at fabricate
   * time. An explicit `terminal` is the way out.
   */
  export class UnterminableRecursiveError extends FabricatorError {
    constructor(
      /**
       * Structural path from the recursive body to the unterminable `self` (or
       * to the `choice` that had no remaining non-`self` option), as field
       * names / slot indices.
       */
      public readonly path: ReadonlyArray<string>,
    ) {
      super();
      this.name = "UnterminableRecursiveError";
      const where =
        path.length === 0 ? "the recursive body itself" : `"${path.join(".")}"`;
      this.message =
        `T.recursive cannot derive a terminal: self at ${where} is not ` +
        "behind a kind that can stop recursing. Wrap it in an array, " +
        "record, choice, omittable, optional, nullable, nullish, or " +
        "undefinable, or pass an explicit terminal.";
    }
  }

  /**
   * A walk reached a node whose `[Kind]` it has no case for — a Schema built by
   * hand or cast past the type system, or a kind added to `Primitive/index.ts`
   * without wiring it into every dispatch site.
   */
  export class UnknownKindError extends FabricatorError {
    constructor(
      /**
       * The unrecognized `[Kind]` tag, stringified — it may be any value at
       * all, since reaching this error means the type system was already
       * bypassed.
       */
      public readonly kind: string,

      /**
       * Which walk failed to dispatch it.
       */
      public readonly during: Phase,
    ) {
      super();
      this.name = "UnknownKindError";
      this.message =
        `Cannot dispatch a Schema of unknown kind "${kind}" while ` +
        `${phrase(during)}.`;
    }
  }

  /**
   * `T.enum`/`T.choice` given no items. An empty draw table has nothing to
   * select, which would otherwise surface as an opaque `TypeError` inside
   * `weighted()` at fabricate time rather than here.
   */
  export class EmptyItemsError extends FabricatorError {
    constructor(
      /**
       * The registry entry that was called, e.g. `"T.enum.uniform"`.
       */
      public readonly label: string,

      /**
       * What the kind calls its items, e.g. `"member"`/`"option"`.
       */
      public readonly noun: string,
    ) {
      super();
      this.name = "EmptyItemsError";
      this.message = `${label} requires at least one ${noun}.`;
    }
  }

  /**
   * An object's definition names a key that would reach `Object.prototype` — a
   * developer-written key, where throwing is actionable (contrast `record`'s
   * _drawn_ keys, written with `Object.defineProperty` instead of rejected).
   */
  export class PrototypePollutionError extends FabricatorError {
    constructor(
      /**
       * The offending key.
       */
      public readonly key: string,
    ) {
      super();
      this.name = "PrototypePollutionError";
      this.message =
        `Potential prototype pollution blocked for key: ${key}. An object ` +
        "schema cannot define a field named `__proto__`, `constructor`, or " +
        "`prototype`.";
    }
  }

  /**
   * A `.refine()`-computed field fabricated on its own. A computed field's
   * value is derived from its sibling fields, so there is nothing to resolve
   * against outside the object that owns it.
   */
  export class DetachedComputeError extends FabricatorError {
    constructor() {
      super();
      this.name = "DetachedComputeError";
      this.message =
        "A `.refine()`-computed field can only be fabricated as part of its " +
        "parent object, which supplies the already-fabricated fields its " +
        "resolver reads.";
    }
  }

  /**
   * A `.refine()`-computed field's resolver returned a value of the wrong shape
   * for the source schema it was declared against.
   */
  export class ComputeResultMismatchError extends FabricatorError {
    constructor(
      /**
       * The `[Kind]` of the field's source schema.
       */
      public readonly kind: string,

      /**
       * What the resolver actually returned.
       */
      public readonly value: unknown,
    ) {
      super();
      this.name = "ComputeResultMismatchError";
      this.message =
        "A `.refine()`-computed field's resolver returned a value of type " +
        `${typeof value} that does not match its "${kind}" source schema.`;
    }
  }

  /**
   * An override names a field the object schema does not define — most often a
   * typo, which is why the known fields are listed.
   */
  export class UnknownOverrideFieldError extends FabricatorError {
    constructor(
      /**
       * The name that was not found.
       */
      public readonly field: string,

      /**
       * Every field the schema does define, in definition order.
       */
      public readonly available: ReadonlyArray<string>,
    ) {
      super();
      this.name = "UnknownOverrideFieldError";
      this.message =
        `Cannot override unknown field: "${field}". This object schema defines ` +
        (available.length === 0
          ? "no fields."
          : `${available.map((k) => `"${k}"`).join(", ")}.`);
    }
  }

  /**
   * An override value does not fit the field it is meant to replace. Raised for
   * every field shape — a plain field, a nested object, and each presence
   * wrapper unwrapped to its inner kind — the same failure in each case.
   */
  export class InvalidOverrideValueError extends FabricatorError {
    constructor(
      /**
       * The field being overridden.
       */
      public readonly field: string,

      /**
       * The `[Kind]` the value was checked against — for a wrapper field, the
       * _inner_ kind, since the wrapper's own absent/null outcomes are accepted
       * separately.
       */
      public readonly kind: string,

      /**
       * The rejected value.
       */
      public readonly value: unknown,
    ) {
      super();
      this.name = "InvalidOverrideValueError";
      this.message =
        `Cannot override field "${field}": a value of type ${typeof value} does ` +
        `not match its "${kind}" schema.`;
    }
  }

  /**
   * Thrown when `Omitted` is passed to override a field that has no absent
   * outcome. Only `T.omittable`/`T.optional` fields can be forced off.
   */
  export class IllegalOmittedOverrideError extends FabricatorError {
    constructor(
      /**
       * The field being overridden.
       */
      public readonly field: string,

      /**
       * The field's `[Kind]`, which is neither `object.omittable` nor
       * `object.optional`.
       */
      public readonly kind: string,
    ) {
      super();
      this.name = "IllegalOmittedOverrideError";
      this.message =
        `Cannot override field "${field}" with Omitted: a "${kind}" field is ` +
        "neither omittable nor optional, so it has no absent outcome to " +
        "select.";
    }
  }

  /**
   * An enumeration axis asked for an index at or past its own width — an
   * internal invariant of `Enumeration/Plan.ts`, not caller-reachable.
   */
  export class EnumerationIndexError extends FabricatorError {
    constructor(
      /**
       * The requested index.
       */
      public readonly index: bigint,

      /**
       * The axis's width, which the index must stay below.
       */
      public readonly width: bigint,
    ) {
      super();
      this.name = "EnumerationIndexError";
      this.message =
        `Enumeration index ${index} is out of range for an axis of width ` +
        `${width}.`;
    }
  }

  /**
   * `resolve()` handed a pin for a kind `plan()` never produces one for — the
   * two must stay in agreement; internal invariant, not caller-reachable.
   */
  export class UnpinnableKindError extends FabricatorError {
    constructor(
      /**
       * The kind that received a pin.
       */
      public readonly kind: string,
    ) {
      super();
      this.name = "UnpinnableKindError";
      this.message =
        `resolve() received a pin for kind "${kind}", which plan() never gives ` +
        "one to.";
    }
  }

  /**
   * `combinatorial(...)` when the cartesian product of every enumerable axis
   * exceeds the configured limit. Thrown eagerly, before any instance is
   * produced.
   */
  export class CombinatorialLimitExceededError extends FabricatorError {
    constructor(
      /**
       * The exact instance count, counted in `bigint` so it stays precise past
       * `Number.MAX_SAFE_INTEGER`.
       */
      public readonly width: bigint,

      /**
       * The configured limit it exceeded.
       */
      public readonly limit: number,
    ) {
      super();
      this.name = "CombinatorialLimitExceededError";
      this.message =
        `combinatorial(...) would enumerate ${width} instances which is over the ` +
        `configured limit of ${limit}. Raise it with initialize({ limits: ` +
        "{ combinatorial } }), or use coverage(...), which needs only as many " +
        "instances as the widest single axis.";
    }
  }

  /**
   * A `record`'s key schema has no counterpart in the external schema library
   * being adapted to — a symbol key, for TypeBox, whose `Type.Record` silently
   * yields a schema nothing can satisfy rather than raising.
   */
  export class UnrepresentableRecordKeyError extends FabricatorError {
    constructor(
      /**
       * The `[Kind]` of the record's key schema.
       */
      public readonly kind: string,
    ) {
      super();
      this.name = "UnrepresentableRecordKeyError";
      this.message =
        `Cannot map a "record" schema keyed by "${kind}" to an external schema: ` +
        "the target has no record with keys of that type. Use " +
        ".adapt(adapter, ...) to supply one.";
    }
  }

  /**
   * A `{ min, max }` range contains no fabricable value — inverted bounds, a
   * point range with an exclusive end, or a discrete exclusive pair whose
   * effective integers are none. Thrown at `.whereby()` (or at construction for
   * `T.date.past`/`future`, whose other end is the instance clock).
   */
  export class EmptyRangeError extends FabricatorError {
    constructor(
      /**
       * The registry entry that was called, e.g. `"T.number.whereby"`.
       */
      public readonly label: string,

      /**
       * Canonical lower bound as stored — `{ value, exclusive }`.
       */
      public readonly min: {
        readonly value: unknown;
        readonly exclusive: boolean;
      },

      /**
       * Canonical upper bound as stored.
       */
      public readonly max: {
        readonly value: unknown;
        readonly exclusive: boolean;
      },
    ) {
      super();
      this.name = "EmptyRangeError";
      this.message =
        `${label} produces an empty range (min=${describeBound(min)}, ` +
        `max=${describeBound(max)}).`;
    }
  }

  function describeBound(bound: {
    readonly value: unknown;
    readonly exclusive: boolean;
  }): string {
    const value = String(bound.value);
    return bound.exclusive ? `{ value: ${value}, exclusive: true }` : value;
  }

  /**
   * A distribution's bounds fall outside its own domain — a `logarithmic`
   * distribution's density is proportional to `1/x`, so it is undefined at or
   * below zero.
   */
  export class InvalidDistributionBoundError extends FabricatorError {
    constructor(
      /**
       * The distribution that rejected the bounds.
       */
      public readonly distribution: string,

      /**
       * The lower bound as given.
       */
      public readonly min: number,

      /**
       * The upper bound as given.
       */
      public readonly max: number,
    ) {
      super();
      this.name = "InvalidDistributionBoundError";
      this.message =
        `The ${distribution} distribution requires min > 0 (received ` +
        `min=${min}, max=${max}); its density is proportional to 1/x and ` +
        "undefined at or below zero.";
    }
  }

  /**
   * Which entry of a `.weighted(...)` call carried the bad weight: a position
   * in a caller-supplied list, or one of a fixed, named outcome set.
   */
  export type WeightEntry =
    | { readonly kind: "index"; readonly index: number; readonly noun: string }
    | { readonly kind: "name"; readonly name: string };

  /**
   * A `.weighted(...)` call gives an outcome a weight that is not expressible:
   * negative, `NaN`, or `Infinity`. Zero is valid — it disables the outcome —
   * so this is not "anything `weighted()` would drop." An empty drawable set is
   * {@link NoDrawableOutcomesError}.
   */
  export class InvalidWeightError extends FabricatorError {
    constructor(
      /**
       * The registry entry that was called, e.g. `"T.choice.weighted"`.
       */
      public readonly label: string,

      /**
       * The rejected weight.
       */
      public readonly weight: number,

      /**
       * Which entry it was attached to.
       */
      public readonly entry: WeightEntry,
    ) {
      super();
      this.name = "InvalidWeightError";

      const where =
        entry.kind === "index"
          ? `${entry.noun} at index ${entry.index}`
          : `"${entry.name}"`;

      this.message =
        `${label} requires every weight to be a finite number ≥ 0; ${where} ` +
        `has weight ${weight}. Zero disables an outcome; a negative weight, ` +
        "NaN, or Infinity is invalid.";
    }
  }

  /**
   * A weighted draw table has nothing left to pick: every weight is zero (or
   * the list was empty of drawable entries). Zeroing an outcome disables it, so
   * at least one must keep a positive weight.
   */
  export class NoDrawableOutcomesError extends FabricatorError {
    constructor(
      /**
       * The registry entry or call site, e.g. `"T.enum.weighted"`.
       */
      public readonly label: string,

      /**
       * What the kind calls its entries, e.g. `"member"`/`"option"`/
       * `"outcome"`/`"component"`/`"character class"`.
       */
      public readonly noun: string,
    ) {
      super();
      this.name = "NoDrawableOutcomesError";
      this.message =
        `${label} leaves no drawable ${noun}. Zeroing an outcome disables ` +
        "it, so at least one must keep a positive weight.";
    }
  }

  /**
   * `new Fabricator(schema, trace)` when `trace.kind` names a different kind
   * than `schema`. A trace reproduces the node it was taken from, so its kind
   * must match the schema it is replayed against.
   */
  export class TraceKindMismatchError extends FabricatorError {
    constructor(
      /**
       * The schema's own kind.
       */
      public readonly expected: string,

      /**
       * The kind recorded on the trace.
       */
      public readonly given: string,
    ) {
      super();
      this.name = "TraceKindMismatchError";
      this.message =
        `Cannot build from a trace for kind "${given}": this schema's ` +
        `kind is "${expected}". A trace reproduces the node it was ` +
        "taken from, so its kind must match the schema it is replayed " +
        "against.";
    }
  }

  /**
   * `wrap(overlay, block)` handed an `async` block while the lineage's ambient
   * carrier is the synchronous one (`Instance/Stack/Sync.ts`).
   *
   * Its frame cannot outlive the block's first `await`, so a build reached
   * after one would resolve against the base instance rather than the wrap —
   * plausible data, quietly drawn from the wrong configuration. Raised instead
   * of allowing that, which is why it fires even when `block` only ever uses
   * `scope`: whether a later build reads the ambient frame is not knowable from
   * here.
   *
   * Reachable only where `#stack` resolved to `default` — a runtime with no
   * `node:async_hooks`, in practice a browser bundle — or where `initialize({
   * stack })` supplied a synchronous carrier explicitly. Node, Bun, and Deno
   * all resolve to the `AsyncLocalStorage` carrier and never raise this.
   */
  export class SynchronousStackError extends FabricatorError {
    constructor() {
      super();
      this.name = "SynchronousStackError";
      this.message =
        "`wrap` received an async block, but this instance's ambient stack " +
        "cannot carry a frame across `await` — a build after the first " +
        "`await` would silently resolve against the base instance. This " +
        "runtime has no `node:async_hooks`, so `#stack` resolved to the " +
        "synchronous carrier; either keep the block synchronous, or pass " +
        "an async-capable carrier as `initialize({ stack })`.";
    }
  }
}
