import { FabricatorError } from "../Error";
import type { Stack } from "../Instance/Types";
import { Primitive } from "../Primitive";
import { isLayered, normalizeSeed } from "../Random";
import type {
  ConstructionTrace,
  ConstructorOptions,
  RandomSource,
  RootPins,
} from "../Random/Types";
import { toSchema } from "../Schema/Core";
import { Adaptation, Fixed, Kind, Layer, Meta, type Buildable } from "../Types";
import { inline } from "../Utility/Core";
import {
  type AsFabricator,
  type ConstructionContext,
  type Fabricator,
} from "./Types";

/**
 * The type of `construct()` itself, as handed back by `Constructor` — kept
 * separate so `initialize`'s return type (`src/index.ts`) can name it without
 * re-deriving it from `Constructor`'s implementation.
 *
 * Both a call signature and a construct signature: `construct` is a plain
 * `function` that explicitly returns an object, so `new construct(schema)`
 * behaves identically to `construct(schema)` — a `new` call's returned object
 * always replaces the freshly-created `this`. The construct signature lets
 * callers spell `new T.Fabricator(schema)` — or `new Fabricator(schema, { seed
 * })` to pin this one build to an explicit seed, independent of the file it's
 * constructed in (see `construct()` for what `options.seed` does).
 */
export type Constructor = {
  new <const $Schema extends Buildable>(
    schema: $Schema,
    options?: ConstructorOptions,
  ): AsFabricator<$Schema>;
};

/**
 * Build the untyped recursive core — mirrors `Adapter/TypeBox/index.ts`'s own
 * internal `convert(schema: any)` — and the precisely-typed `construct()`
 * boundary around it, both closed over a single instance's `source` so every
 * fabricator this `construct()` produces draws from that instance's own
 * seed/streams and never another instance's.
 *
 * `stack` is the instance's own lineage-wide ambient stack
 * (`Instance/Core.ts`'s `toStack()`) — passed straight through to
 * `resolveScope` on every `construct()` call, never read here directly, so a
 * build reached inside an active `wrap` resolves against that frame
 * automatically, with nothing threaded through by the caller.
 *
 * No separate `clock` parameter: `source` already carries its own resolved
 * clock intrinsically (`Random/Types.ts`'s `Options.clock`, baked in when the
 * source was built), and `resolveScope`'s chosen source — the active `wrap`
 * frame's, or this one — is exactly the source whose clock a construction
 * should resolve "now" against. `toConstructionContext` reads it straight off
 * the resolved root rather than threading a second value alongside `source`.
 */
export function Constructor(source: RandomSource, stack: Stack): Constructor {
  /**
   * `schema` is `any` at the parameter: `switch (schema[Kind])` does not
   * narrow. Each case immediately casts to that kind's `Schema` (`const s =
   * schema as Primitive.object.Schema`) and uses `s` for the rest of the
   * branch, so nothing after the discriminant operates on `any`. The parameter
   * must stay `any`, not `Buildable`/`AnySchema` — either of those infers
   * `[Kind]: string`/`[Meta]: PlainObject`, too wide to satisfy any single leaf
   * kind's `Schema` parameter. `toSchema` is assigned back onto `schema` rather
   * than a typed local for the same reason: a generic call with an `any`
   * argument still infers the constraint, and a wider local would make the
   * per-case `as` fail to overlap. Kinds are reached as
   * `Primitive.boolean.Schema`, never a top-level `import * as boolean`: that
   * value binding shadows the TypeScript primitive. Those kinds' `Types.ts`
   * must also stay type-only (see `boolean/Outcomes.ts`) or `export * as
   * boolean` in `Primitive/namespace.ts` drops `[Kind]` off `boolean.Core` the
   * same way.
   *
   * Recurses into itself (not into `construct()`) for `array`/`object` fields.
   *
   * `path` is this node's structural position within the one construction
   * `context` belongs to — a field name, a slot/option index, and so on,
   * extended by exactly one segment per level of nesting (see each branch
   * below). It is what a leaf's own draw is keyed by, alongside `kind`, through
   * `context.toTrace(path, kind)` — never re-resolved from the call stack here,
   * since the construction's root was already resolved once, in `construct()`.
   */
  function make(
    schema: any,
    path: ReadonlyArray<string>,
    context: ConstructionContext,
  ): Fabricator<any> {
    schema = toSchema(schema);
    const kind = schema[Kind];

    const common = {
      algorithm: context.algorithm,
      trace: context.toTrace(path, kind),
    };

    switch (kind) {
      case "number": {
        const s = schema as Primitive.number.Schema;
        return Primitive.number.Fabricator({ ...common, schema: s });
      }
      case "date": {
        const s = schema as Primitive.date.Schema;
        return Primitive.date.Fabricator({ ...common, schema: s });
      }
      case "boolean": {
        const s = schema as Primitive.boolean.Schema;
        return Primitive.boolean.Fabricator({ ...common, schema: s });
      }
      case "enum": {
        const s = schema as Primitive.enum.Schema;
        return Primitive.enum.Fabricator({ ...common, schema: s });
      }
      case "choice": {
        const s = schema as Primitive.choice.Schema;
        const options = s[Meta].items.map(
          ([weight, item], i) =>
            [weight, make(item, [...path, i.toString(10)], context)] as const,
        );
        return Primitive.choice.Fabricator({ ...common, schema: s }, options);
      }
      case "always": {
        const s = schema as Primitive.always.Schema;
        return Primitive.always.Fabricator({ ...common, schema: s });
      }
      /**
       * Always given a stream, unlike every other produce-driven path — for an
       * opaque value the stream is what produce is called with, so there is
       * nothing to short-circuit. See opaque/Fabricator.ts.
       */
      case "opaque": {
        const s = schema as Primitive.opaque.Schema;
        return Primitive.opaque.Fabricator({ ...common, schema: s });
      }
      case "symbol": {
        const s = schema as Primitive.symbol.Schema;
        return Primitive.symbol.Fabricator({ ...common, schema: s });
      }
      case "undefined": {
        const s = schema as Primitive.undefined.Schema;
        return Primitive.undefined.Fabricator({ ...common, schema: s });
      }
      case "undefinable": {
        const s = schema as Primitive.undefinable.Schema;
        const inner = make(
          s[Meta].definition,
          [...path, "definition"],
          context,
        );
        return Primitive.undefinable.Fabricator(
          { ...common, schema: s },
          inner,
        );
      }
      case "null": {
        const s = schema as Primitive.null.Schema;
        return Primitive.null.Fabricator({ ...common, schema: s });
      }
      case "nullable": {
        const s = schema as Primitive.nullable.Schema;
        const inner = make(
          s[Meta].definition,
          [...path, "definition"],
          context,
        );
        return Primitive.nullable.Fabricator({ ...common, schema: s }, inner);
      }
      case "nullish": {
        const s = schema as Primitive.nullish.Schema;
        const inner = make(
          s[Meta].definition,
          [...path, "definition"],
          context,
        );
        return Primitive.nullish.Fabricator({ ...common, schema: s }, inner);
      }
      case "string": {
        const s = schema as Primitive.string.Schema;
        return Primitive.string.Fabricator({ ...common, schema: s });
      }
      case "bigint": {
        const s = schema as Primitive.bigint.Schema;
        return Primitive.bigint.Fabricator({ ...common, schema: s });
      }
      case "array": {
        const s = schema as Primitive.array.Schema;
        const element = make(s[Meta].definition, [...path, "element"], context);
        return Primitive.array.Fabricator({ ...common, schema: s }, element);
      }
      /**
       * Two independent dispatches — one shared key Fabricator and one shared
       * value Fabricator, each on its own private stream, reused for every
       * entry (the same arrangement `array` has for its single element, not
       * `object`/`tuple`'s one-per-position).
       */
      case "record": {
        const s = schema as Primitive.record.Schema;
        const key = make(s[Meta].key, [...path, "key"], context);
        const value = make(s[Meta].value, [...path, "value"], context);
        return Primitive.record.Fabricator(
          { ...common, schema: s },
          key,
          value,
        );
      }
      /**
       * The one kind that dispatches _itself_ lazily rather than eagerly — see
       * `recursive/Fabricator.ts`. `forkSource` mints a brand new, fully
       * isolated `RandomSource` seeded from this node's own draw, so however
       * many times (or however deeply) later `fabricate()` calls end up
       * dispatching `body`/`terminal`, none of it ever touches — or is touched
       * by — this `Constructor()` call's shared, global `source`. Each lazy
       * expansion opens its own scope on that private source (see
       * `recursive/Fabricator.ts`), so path resets to `[]` beneath it —
       * structural position inside `body`/`terminal` is only meaningful
       * relative to one expansion, not to this node's own outer position.
       *
       * `source.fork`, not `context`'s, even when nested inside another
       * recursive schema's own body: a `T.recursive` nested inside another
       * one's body is out of scope for this design (see `recursive/Types.ts`)
       * and forking from the outermost global source rather than the enclosing
       * recursive node's private one is the harmless side of that gap — it
       * costs isolation between the two nested recursive schemas' internals,
       * not correctness of either on its own.
       */
      case "recursive": {
        const s = schema as Primitive.recursive.Schema;
        return Primitive.recursive.Fabricator(
          { ...common, schema: s },
          source.fork,
          make,
        );
      }
      /**
       * A transient passthrough: resolves against whichever `T.recursive` is
       * currently expanding, via `context.self`. Built unconditionally so a
       * captured `self` schema plus its trace can be reconstructed;
       * `.fabricate()` throws `DetachedSelfError` when `context.self` is absent
       * — a misuse only reachable by holding onto a stale `self` reference
       * outside the `T.recursive` callback it came from, or by replaying a
       * `self` node without its enclosing recursive parent.
       */
      case "recursive.self": {
        const s = schema as Primitive.recursive.self.Schema;
        return Primitive.recursive.self.Fabricator(
          { ...common, schema: s },
          context.self,
        );
      }
      case "tuple": {
        /**
         * Each slot gets its own independently-dispatched Fabricator (see
         * `tuple/Fabricator.ts` for why this, unlike `array`'s single shared
         * `element`, is the point) — `algorithm` still rides along for the
         * `.as(...)` override path, which is what calls `toStreamFromTrace`. A
         * bare tuple draws no randomness of its own, exactly like `object`, but
         * still records `trace` so a nested tuple can be replayed from its own
         * schema.
         */
        const s = schema as Primitive.tuple.Schema;
        const elements = s[Meta].items.map((item, i) =>
          make(item, [...path, i.toString(10)], context),
        );
        return Primitive.tuple.Fabricator({ ...common, schema: s }, elements);
      }
      case "object.compute": {
        const s = schema as Primitive.object.compute.Schema<any, any>;
        return Primitive.object.compute.Fabricator({ ...common, schema: s });
      }
      case "object.omittable": {
        const s = schema as Primitive.object.omittable.Schema;
        const inner = make(
          s[Meta].definition,
          [...path, "definition"],
          context,
        );
        return Primitive.object.omittable.Fabricator(
          { ...common, schema: s },
          inner,
        );
      }
      case "object.optional": {
        const s = schema as Primitive.object.optional.Schema;
        const inner = make(
          s[Meta].definition,
          [...path, "definition"],
          context,
        );
        return Primitive.object.optional.Fabricator(
          { ...common, schema: s },
          inner,
        );
      }
      case "object": {
        const s = schema as Primitive.object.Schema;
        const definition = s[Meta].definition;
        const fields: Primitive.object.Fields = {};

        for (const key in definition) {
          const fieldSchema = definition[key]!;
          const fieldPath = [...path, key];

          fields[key] = inline(() => {
            if (Fixed in fieldSchema) {
              /**
               * Still dispatched — not for stream-parity: path keying means
               * skipping a dispatch can't shift any sibling's stream. The
               * dispatch is only to detect, via the built Fabricator's own
               * `[Kind]`, whether this field was an `object.compute` field, so
               * an overridden compute field resolves immediately in phase 1
               * like any ordinary field instead of deferring to phase 2 (see
               * below).
               */
              const built = make(fieldSchema, fieldPath, context);
              const value = fieldSchema[Fixed];

              if (Primitive.object.compute.isObjectComputeFabricator(built)) {
                /**
                 * Reassigning `[Kind]` off "object.compute" keeps this field
                 * out of `object/Core.ts`'s `fabricate()` phase-2 deferral — an
                 * overridden compute field resolves immediately in phase 1,
                 * exactly like an ordinary field. `[Meta]` is left as the
                 * compute shape; nothing reads it off of a `fields` entry.
                 *
                 * Source kind is read off the built Fabricator — its `[Meta]`
                 * is the compute shape, which the field Schema after `toSchema`
                 * does not expose as `AnySchema`.
                 */
                return {
                  ...built,
                  [Kind]: built[Meta].source[Kind],
                  fabricate: () => value,
                };
              }

              return { ...built, fabricate: () => value };
            }

            return make(fieldSchema, fieldPath, context);
          });
        }

        /**
         * `Primitive.object.rehydrate(s)`, not the bare `s`: `toSchema` (above)
         * has already dropped `extend`/`refine` from `s`, but the Fabricator
         * this produces still needs a real, composable Schema for its own
         * `.schema` — rebuilt here from `s[Meta]`'s `definition`/`refinements`,
         * the only place left that still has them.
         */
        return Primitive.object.Fabricator(
          { ...common, schema: Primitive.object.rehydrate(s) },
          fields,
        );
      }

      default:
        throw new FabricatorError.UnknownKindError(
          String(kind),
          "construction",
        );
    }
  }

  /**
   * The sole place a Fabricator is created: turn a Schema (or an already-built
   * Fabricator, normalized back to the Schema it came from) into a live
   * Fabricator, deriving fresh randomness (from this `Constructor` call's
   * `source`) for whichever leaves actually need it. `make` does the untyped
   * recursive work; this is the one precisely-typed boundary, exactly how
   * `toTypeBox()` relates to its own internal `convert()`.
   *
   * A bare `options.seed` is a statement about _attribution_: it forks a fresh,
   * isolated source from exactly that value, sidestepping both the default
   * call-site logic _and_ the instance's own seed — the same seed reproduces
   * the same result no matter which file `new Fabricator(...)` is written in or
   * how the instance itself was seeded — and opens an `"unattributed"` scope on
   * that fork (see `RandomSource.fork` in `Random/index.ts`, and `resolveScope`
   * below). `options.seed: layer(...)` forks the same way but composes onto the
   * instance's own seed first, so the construction still varies when the
   * instance is reseeded — see `ConstructorOptions` (`Random/Types.ts`).
   *
   * No per-build algorithm override alongside `seed`: a different PRNG says
   * nothing about wanting to abandon file attribution, so it doesn't fit the
   * same "sidestep call-site logic" story — and instance-wide `initialize({
   * algorithm })` already covers bringing your own PRNG. See
   * `ConstructorOptions` (`Random/Types.ts`).
   */
  function construct<const $Schema extends Buildable>(
    schema: $Schema,
    options: ConstructorOptions = {},
  ): AsFabricator<$Schema> {
    if (typeof options.kind === "string" && options.kind !== schema[Kind]) {
      throw new FabricatorError.TraceKindMismatchError(
        schema[Kind],
        options.kind,
      );
    }

    const context = toConstructionContext(source, options, stack);
    const made = make(schema, options.path ?? [], context);
    const adaptations = schema[Adaptation];

    /**
     * Carried onto the built Fabricator so `toTypeBox(new Fabricator(...))`
     * sees what the Schema declared, matching what `AsFabricator` already says
     * about its type. Only needed here, on the outermost Fabricator: a nested
     * field's adaptation is read off `[Meta].definition` — where `toSchema`
     * kept it — not off the per-field Fabricator, which is internal to
     * `object`/`array` and never handed to an adapter.
     */
    return (
      adaptations ? { ...made, [Adaptation]: adaptations } : made
    ) as AsFabricator<$Schema>;
  }

  /**
   * `as unknown as Constructor`, not a bare `as Constructor`: TypeScript infers
   * only a call signature for a `function` declaration, never the construct
   * signature `Constructor` declares, and a call-only type and a construct-only
   * type don't overlap enough for a direct cast. The `unknown` hop is safe
   * because `construct` is constructible at runtime regardless of what TS
   * infers for it (see `Constructor`) — it always explicitly returns an object,
   * so `new construct(schema)` really does work.
   */
  return construct as unknown as Constructor;
}

/**
 * `clock` is not a field of its own: `toTrace` spreads `construction`, so every
 * node's `trace.clock` _is_ `construction.clock`. `resolveScope`'s resolved
 * `ConstructionTrace` already carries whichever source's clock this
 * construction should resolve "now" against (the active `wrap` frame's, this
 * instance's own, an explicitly seeded fork of one of those, or a pin from a
 * replayed {@link Trace}). No separate resolution needed here: a
 * `RandomSource`'s clock is baked in, as a concrete number, the moment it's
 * built (`Random/index.ts`'s `toRandomSource`), so `construction.clock` is
 * never the unresolved `"seeded"` sentinel by the time it reaches this point.
 * `algorithm` is read off `rooted`, not `config.algorithm`: an active `wrap`
 * frame's source may carry a different one.
 */
function toConstructionContext(
  source: RandomSource,
  options: ConstructorOptions,
  stack: Stack,
): ConstructionContext {
  const { source: rooted, root: construction } = resolveScope(
    source,
    options,
    stack,
  );

  return {
    toTrace: (path, kind) => ({ ...construction, path, kind }),
    algorithm: rooted.algorithm,
  };
}

/**
 * Resolve the root one `new Fabricator(...)` call's leaves are dispatched
 * against — both the `RandomSource` to draw from (the active `wrap` frame's,
 * the instance's own, or an explicitly seeded fork of one of those) and that
 * source's resolved `ConstructionTrace`, since a fork's stream derivation is
 * only reachable through the fork itself. `construct()` calls this exactly once
 * and reuses both across every leaf, rather than re-resolving per leaf.
 *
 * `base` — the active frame's source if `stack.current()` finds one, otherwise
 * this instance's own `source` — is resolved first, since every branch below is
 * relative to it:
 *
 * - **Unseeded, no active frame**: `source`, `"attributed"`.
 * - **Unseeded, inside a `wrap`**: `frame.source`, still `"attributed"` — the
 *   frame's own source carries the frame's own resolved attribution policy, so
 *   a build inside a `wrap` keeps ordinary file attribution and ordinary
 *   per-file ordinals, exactly as it would under a separately `initialize()`d
 *   instance sharing that same config. This branch is a no-op for the wrap's
 *   _own_ `scope.Fabricator` (`frame.source` already _is_ that instance's
 *   `source`) — which is the point, not an accident: it's what makes the
 *   implicit and explicit routes resolve identically.
 * - **A bare seed, either way**: `base.fork(seed)`, `"unattributed"` — a
 *   caller-chosen root replaces a resolved file regardless of an active frame
 *   (`base === source` whenever no frame is active).
 * - **A layered seed (`layer(...)`), either way**: `base.fork([...base.seed,
 *   ...layered])`, `"unattributed"` — composes onto _whichever_ base is in
 *   effect: the instance's own seed with no active frame, or the frame's
 *   effective seed inside a `wrap`. Forking from `base` rather than always
 *   `source` matters only here — a bare seed ignores its base's seed entirely,
 *   so it can't tell the difference.
 *
 * Pins from `options` (`clock`/`root`/`file`/`ordinal`) are threaded into both
 * `toRoot` calls and win over an active `wrap` frame — they are the more
 * specific statement, including a full replayed {@link Trace}.
 */
function resolveScope(
  source: RandomSource,
  options: ConstructorOptions,
  stack: Stack,
): { source: RandomSource; root: ConstructionTrace } {
  const frame = stack.current();
  const base = frame?.source ?? source;
  const pins: RootPins = {
    clock: options.clock,
    root: options.root,
    file: options.file,
    ordinal: options.ordinal,
  };

  if (!options.seed) {
    return { source: base, root: base.toRoot("attributed", pins) };
  }

  const seed = isLayered(options.seed)
    ? [...base.seed, ...normalizeSeed(options.seed[Layer])]
    : options.seed;

  const forked = base.fork(seed);

  return { source: forked, root: forked.toRoot("unattributed", pins) };
}
