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
 *
 * A `name` is the package and the class,
 * `"@ghostry/fabricator:UnknownFieldError"`, so it identifies an error where
 * `instanceof` cannot: across two installed copies of this package, or after
 * the error is serialized. `:`, not `/`, which would read as a subpath export.
 * A package extending {@link FabricatorError} prefixes its own errors with its
 * own name.
 */

/**
 * Base error class from which more specific errors inherit.
 */
export abstract class FabricatorError extends Error {
  constructor() {
    super();
    this.name = "@ghostry/fabricator:FabricatorError";
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
      this.name = "@ghostry/fabricator:InvalidCombinatorialLimitError";
      this.message =
        `initialize({ limits: { combinatorial } }) requires a positive safe `
        + `integer; received ${String(limit)}.`;
    }
  }

  /**
   * `initialize({ clock })`, `fork({ clock })`, or `wrap({ clock }, …)` given
   * an instant a `Date` cannot hold exactly — a fractional or non-finite
   * number, one past ±8.64e15, or an invalid `Date`. Rejected rather than
   * adjusted the way `Date`'s own `TimeClip` would, so the clock a run records
   * is the clock the caller passed.
   */
  export class InvalidClockError extends FabricatorError {
    constructor(
      /**
       * The rejected clock, as given — a number or a `Date`.
       */
      public readonly clock: unknown,
    ) {
      super();
      this.name = "@ghostry/fabricator:InvalidClockError";
      this.message =
        "clock requires a valid Date or an integer number of epoch "
        + `milliseconds within ±8.64e15; received ${String(clock)}.`;
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
      this.name = "@ghostry/fabricator:DetachedSelfError";
      this.message =
        "`self` was used outside any active `T.recursive` while "
        + `${phrase(during)} — it can only appear inside the body (or terminal) `
        + "passed to `T.recursive(...)`, and a `self` captured out of that "
        + "callback cannot be reused elsewhere.";
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
      this.name = "@ghostry/fabricator:UnterminableRecursiveError";
      const where =
        path.length === 0 ? "the recursive body itself" : `"${path.join(".")}"`;
      this.message =
        `T.recursive cannot derive a terminal: self at ${where} is not `
        + "behind a kind that can stop recursing. Wrap it in an array, "
        + "record, choice, omittable, optional, nullable, nullish, or "
        + "undefinable, or pass an explicit terminal.";
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
      this.name = "@ghostry/fabricator:UnknownKindError";
      this.message =
        `Cannot dispatch a Schema of unknown kind "${kind}" while `
        + `${phrase(during)}.`;
    }
  }

  /**
   * A pick with nothing to pick from: `T.enum`/`T.choice` given no items, or
   * `sample()` (`Distribution/index.ts`) given an empty list. Emptiness is
   * otherwise only discovered mid-draw, and opaquely — as a `TypeError` inside
   * `weighted()` for the registries, whose empty draw table makes `.find`
   * return `undefined`, and as an out-of-range element read for `sample`.
   *
   * The registries throw at construction, where the mistake is; `sample` can
   * only throw at fabricate time, since a producer is the only place it runs.
   */
  export class EmptyItemsError extends FabricatorError {
    constructor(
      /**
       * The registry entry or helper that was called, e.g. `"T.enum"` or
       * `"sample"`.
       */
      public readonly label: string,

      /**
       * What the caller calls its items, e.g. `"member"`/`"option"`/`"item"`.
       */
      public readonly noun: string,
    ) {
      super();
      this.name = "@ghostry/fabricator:EmptyItemsError";
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
      this.name = "@ghostry/fabricator:PrototypePollutionError";
      this.message =
        `Potential prototype pollution blocked for key: ${key}. An object `
        + "schema cannot define a field named `__proto__`, `constructor`, or "
        + "`prototype`.";
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
      this.name = "@ghostry/fabricator:DetachedComputeError";
      this.message =
        "A `.refine()`-computed field can only be fabricated as part of its "
        + "parent object, which supplies the already-fabricated fields its "
        + "resolver reads.";
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
      this.name = "@ghostry/fabricator:ComputeResultMismatchError";
      this.message =
        "A `.refine()`-computed field's resolver returned a value of type "
        + `${typeof value} that does not match its "${kind}" source schema.`;
    }
  }

  /**
   * A `T.derive` resolver returned a value of the wrong shape for the `to`
   * schema it was declared against.
   */
  export class DeriveResultMismatchError extends FabricatorError {
    constructor(
      /**
       * The `[Kind]` of the derive's `to` schema.
       */
      public readonly kind: string,

      /**
       * What the resolver actually returned.
       */
      public readonly value: unknown,
    ) {
      super();
      this.name = "@ghostry/fabricator:DeriveResultMismatchError";
      this.message =
        "A T.derive resolver returned a value of type "
        + `${typeof value} that does not match its \`to\` schema ("${kind}").`;
    }
  }

  /**
   * A key names a field the object schema does not define — most often a typo,
   * which is why the known fields are listed. One failure reached from four
   * places: `.override()`, `T.pick`, `T.omit`, and a compute field's
   * `.from([...])`, told apart by `operation`.
   */
  export class UnknownFieldError extends FabricatorError {
    constructor(
      /**
       * The name that was not found.
       */
      public readonly field: string,

      /**
       * Every field the schema does define, in definition order. For `"compute
       * from"`, the fields the enclosing `.refine()` stage can read.
       */
      public readonly available: ReadonlyArray<string>,

      /**
       * What named the unknown field, worded to read as the message's verb.
       */
      public readonly operation: "override" | "pick" | "omit" | "compute from",
    ) {
      super();
      this.name = "@ghostry/fabricator:UnknownFieldError";
      this.message =
        `Cannot ${operation} unknown field: "${field}". `
        + "This object schema defines "
        + (available.length === 0
          ? "no fields."
          : `${available.map((k) => `"${k}"`).join(", ")}.`);
    }
  }

  /**
   * Compute fields whose declared dependencies form a loop, so none of them can
   * resolve first. A compute field only names fields that already exist, but a
   * later `.refine()` or `.extend()` can replace one of those with a compute
   * field that reads it back. Thrown by that call, while building the schema,
   * never at fabrication.
   */
  export class ComputeDependencyCycleError extends FabricatorError {
    constructor(
      /**
       * The compute fields on the loop, in the order they were reached.
       */
      public readonly fields: ReadonlyArray<string>,
    ) {
      super();
      this.name = "@ghostry/fabricator:ComputeDependencyCycleError";
      this.message =
        "Computed fields depend on each other in a cycle: "
        + `${fields.map((k) => `"${k}"`).join(" -> ")}.`;
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
      this.name = "@ghostry/fabricator:InvalidOverrideValueError";
      this.message =
        `Cannot override field "${field}": a value of type ${typeof value} does `
        + `not match its "${kind}" schema.`;
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
      this.name = "@ghostry/fabricator:IllegalOmittedOverrideError";
      this.message =
        `Cannot override field "${field}" with Omitted: a "${kind}" field is `
        + "neither omittable nor optional, so it has no absent outcome to "
        + "select.";
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
      this.name = "@ghostry/fabricator:EnumerationIndexError";
      this.message =
        `Enumeration index ${index} is out of range for an axis of width `
        + `${width}.`;
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
      this.name = "@ghostry/fabricator:UnpinnableKindError";
      this.message =
        `resolve() received a pin for kind "${kind}", which plan() never gives `
        + "one to.";
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
      this.name = "@ghostry/fabricator:CombinatorialLimitExceededError";
      this.message =
        `combinatorial(...) would enumerate ${width} instances which is over the `
        + `configured limit of ${limit}. Raise it with initialize({ limits: `
        + "{ combinatorial } }), or use coverage(...), which needs only as many "
        + "instances as the widest single axis.";
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
      this.name = "@ghostry/fabricator:UnrepresentableRecordKeyError";
      this.message =
        `Cannot map a "record" schema keyed by "${kind}" to an external schema: `
        + "the target has no record with keys of that type. Use "
        + ".adapt(adapter, ...) to supply one.";
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
      this.name = "@ghostry/fabricator:EmptyRangeError";
      this.message =
        `${label} produces an empty range (min=${describeBound(min)}, `
        + `max=${describeBound(max)}).`;
    }
  }

  /**
   * A bound given as a `number` that does not convert exactly to its kind's
   * type — a fractional or unsafe integer for a `bigint`, an instant `Date`
   * cannot hold — or a non-finite value where an end must be finite.
   */
  export class InvalidBoundError extends FabricatorError {
    constructor(
      /**
       * What was called, e.g. `"T.bigint.whereby"` or `".admits on a bigint
       * schema"`.
       */
      public readonly label: string,

      /**
       * Which end was rejected.
       */
      public readonly end: "min" | "max",

      /**
       * The rejected value, as given.
       */
      public readonly value: number,

      /**
       * What the end accepts, in words — e.g. `"a safe integer or a bigint"`.
       */
      public readonly expected: string,
    ) {
      super();
      this.name = "@ghostry/fabricator:InvalidBoundError";
      this.message = `${label}: ${end} must be ${expected}; received ${String(value)}.`;
    }
  }

  /**
   * `.admits(...)` names an end that excludes values the schema fabricates.
   * Admitted ends may only widen the fabricated range — a fabricated value must
   * pass the validation an adapter builds from them.
   */
  export class AdmitsExcludesDrawError extends FabricatorError {
    constructor(
      /**
       * What was called, e.g. `".admits on a string schema"`.
       */
      public readonly label: string,

      /**
       * The rejected end's path, e.g. `"length.max"` or `"min"`.
       */
      public readonly end: string,

      /**
       * The admitted end, canonical as stored.
       */
      public readonly admitted: {
        readonly value: unknown;
        readonly exclusive: boolean;
      },

      /**
       * The fabricated end it excludes values from; absent when that end is
       * drawn against the kind's unbounded cap, which only no limit admits.
       */
      public readonly fabricated:
        | { readonly value: unknown; readonly exclusive: boolean }
        | undefined,
    ) {
      super();
      this.name = "@ghostry/fabricator:AdmitsExcludesDrawError";
      const drawn =
        fabricated === undefined
          ? "an unbounded end"
          : `${end}=${describeBound(fabricated)}`;
      const unlimited = end.endsWith("min") ? "-Infinity" : "Infinity";
      this.message =
        `${label}: ${end}=${describeBound(admitted)} excludes values the `
        + `schema fabricates, which reach ${drawn}. Admitted ends may only `
        + `widen the fabricated range; pass ${unlimited} for no limit.`;
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
      this.name = "@ghostry/fabricator:InvalidDistributionBoundError";
      this.message =
        `The ${distribution} distribution requires min > 0 (received `
        + `min=${min}, max=${max}); its density is proportional to 1/x and `
        + "undefined at or below zero.";
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
      this.name = "@ghostry/fabricator:InvalidWeightError";

      const where =
        entry.kind === "index"
          ? `${entry.noun} at index ${entry.index}`
          : `"${entry.name}"`;

      this.message =
        `${label} requires every weight to be a finite number ≥ 0; ${where} `
        + `has weight ${weight}. Zero disables an outcome; a negative weight, `
        + "NaN, or Infinity is invalid.";
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
      this.name = "@ghostry/fabricator:NoDrawableOutcomesError";
      this.message =
        `${label} leaves no drawable ${noun}. Zeroing an outcome disables `
        + "it, so at least one must keep a positive weight.";
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
      this.name = "@ghostry/fabricator:TraceKindMismatchError";
      this.message =
        `Cannot build from a trace for kind "${given}": this schema's `
        + `kind is "${expected}". A trace reproduces the node it was `
        + "taken from, so its kind must match the schema it is replayed "
        + "against.";
    }
  }

  /**
   * `fabricate(...)` handed anything but a Schema: a built Fabricator, a bare
   * builder that still needs configuring (`T.array(x)`, `T.recursive(f)`), or a
   * value that is no schema at all. Its type already rejects each; this is the
   * runtime guard for an untyped caller.
   */
  export class FabricateArgumentError extends FabricatorError {
    constructor(
      /**
       * What `fabricate(...)` was handed.
       */
      public readonly argument: unknown,
    ) {
      super();
      this.name = "@ghostry/fabricator:FabricateArgumentError";
      this.message = describe(argument);

      function describe(given: unknown): string {
        if (
          typeof given === "object"
          && given !== null
          && "fabricate" in given
        ) {
          return (
            "fabricate(...) takes a Schema, not a built Fabricator. Call "
            + "`.fabricate()` on the Fabricator you have, or pass its "
            + "`.schema` to fabricate(...)."
          );
        }

        return (
          `fabricate(...) takes a Schema, but was handed a ${typeof given}. `
          + "A builder that still needs configuring, such as `T.array(x)`, "
          + "becomes a Schema once you call `.whereby(...)` on it."
        );
      }
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
      this.name = "@ghostry/fabricator:SynchronousStackError";
      this.message =
        "`wrap` received an async block, but this instance's ambient stack "
        + "cannot carry a frame across `await` — a build after the first "
        + "`await` would silently resolve against the base instance. This "
        + "runtime has no `node:async_hooks`, so `#stack` resolved to the "
        + "synchronous carrier; either keep the block synchronous, or pass "
        + "an async-capable carrier as `initialize({ stack })`.";
    }
  }

  /**
   * The `fabricator` provider of `integration(instance)`
   * (`@ghostry/fabricator/harnessing`) was called outside that integration's
   * own frame.
   *
   * The provider hands back the per-test scope the frame's wrapper established,
   * which reaches it as the provider's second argument, so there is no scope
   * for it to return anywhere else. `@ghostry/harness` never does this — it
   * runs each provider inside the frame it opened and passes that scope forward
   * — so this means a composer that breaks the contract. Raised rather than
   * returning the base instance, which would draw plausible data from the wrong
   * configuration with no signal.
   */
  export class HarnessingProviderError extends FabricatorError {
    constructor() {
      super();
      this.name = "@ghostry/fabricator:HarnessingProviderError";
      this.message =
        "The `fabricator` provider was called outside its integration's "
        + "frame, so there is no per-test scope to provide. A composer must "
        + "run each integration's providers inside the frame it opened, "
        + "passing forward what that frame's wrapper established, as "
        + "`@ghostry/harness` does.";
    }
  }

  /**
   * Where a unique leaf that ran out sits directly inside a plain collection —
   * the element of a `T.array` or the key of a `T.record`. Such a leaf stays
   * distinct across every value the collection makes, which is easy to mistake
   * for distinct within one, so the message names `T.unique.array`/
   * `T.unique.record`.
   */
  export type UniqueWithin = "array" | "record";

  function within(collection: UniqueWithin | undefined): string {
    switch (collection) {
      case undefined:
        return "";
      case "array":
        return (
          " It is the element of a T.array, which reuses one element across "
          + "every array it makes, so its values stay distinct across all of "
          + "them. For members distinct within each array, use T.unique.array."
        );
      case "record":
        return (
          " It is the key of a T.record, which reuses one key across every "
          + "record it makes, so its keys stay distinct across all of them. For "
          + "keys distinct within each record, use T.unique.record."
        );
    }
  }

  /**
   * A `T.unique.*` leaf asked for one more value than its domain holds. Thrown
   * on draw n + 1 of an n-value domain whatever the salt, since a domain with a
   * known size is counted rather than searched (`Unique/Distinct.ts`).
   */
  export class UniqueExhaustedError extends FabricatorError {
    constructor(
      /**
       * The `[Kind]` of the exhausted schema.
       */
      public readonly kind: string,

      /**
       * How many distinct values the domain holds — every one of them already
       * produced or claimed.
       */
      public readonly capacity: bigint,

      /**
       * The plain collection the leaf sits directly inside, when it does.
       */
      public readonly collection?: UniqueWithin,
    ) {
      super();
      this.name = "@ghostry/fabricator:UniqueExhaustedError";
      this.message =
        `A unique "${kind}" has produced all ${capacity} of its distinct `
        + "values, so another draw cannot be unique. Widen its domain, or "
        + "build a fresh Fabricator to start over."
        + within(collection);
    }
  }

  /**
   * A unique draw over a domain of unknown size kept landing on values it had
   * already produced, and forfeited after its redraws ran out rather than loop
   * forever. Either the domain is used up, or it is skewed enough that its
   * remaining values are rare — a higher `redraws` is for the second case.
   */
  export class UniqueRedrawsError extends FabricatorError {
    constructor(
      /**
       * The registry entry or call site, e.g. `"T.unique.array"`.
       */
      public readonly label: string,

      /**
       * How many redraws the draw was allowed after its first, each of which
       * also repeated a value already produced.
       */
      public readonly redraws: number,

      /**
       * How many distinct values the scope had produced when it gave up.
       */
      public readonly produced: number,

      /**
       * The plain collection a unique leaf sits directly inside, when it does.
       */
      public readonly collection?: UniqueWithin,
    ) {
      super();
      this.name = "@ghostry/fabricator:UniqueRedrawsError";
      this.message =
        `${label} gave up after ${redraws} redraws without finding a value `
        + `it had not already produced (it had produced ${produced}). The `
        + "domain is used up, or its remaining values are too rare to find. "
        + "Widen the domain, or raise `redraws` if its distribution is skewed."
        + within(collection);
    }
  }

  /**
   * A unique collection could draw more members than its member schema has
   * distinct values. Thrown at construction, so the draw that would run out
   * never depends on the salt.
   */
  export class UniqueCapacityError extends FabricatorError {
    constructor(
      /**
       * The registry entry, e.g. `"T.unique.array"`.
       */
      public readonly label: string,

      /**
       * How many distinct values the member schema has.
       */
      public readonly capacity: bigint,

      /**
       * The largest member count the collection may draw.
       */
      public readonly requested: number,
    ) {
      super();
      this.name = "@ghostry/fabricator:UniqueCapacityError";
      this.message =
        `${label} may draw up to ${requested} distinct members, but its `
        + `member schema has only ${capacity} distinct values. Lower the `
        + "maximum, or widen the member schema.";
    }
  }

  /**
   * `redraws` on a unique builder is not a whole number from `0` up, so it
   * could never be a count of retries.
   */
  export class InvalidRedrawsError extends FabricatorError {
    constructor(
      /**
       * The registry entry, e.g. `"T.unique.array.whereby"`.
       */
      public readonly label: string,

      /**
       * The rejected value.
       */
      public readonly redraws: number,
    ) {
      super();
      this.name = "@ghostry/fabricator:InvalidRedrawsError";
      this.message =
        `${label} got redraws: ${redraws}, which is not a count of retries. `
        + "Pass a whole number, 0 or more.";
    }
  }
}
