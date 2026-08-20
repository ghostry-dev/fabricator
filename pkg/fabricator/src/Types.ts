import type { Fabricator } from "./Fabricator/Types";
import type { AnySchema } from "./Schema/Types";

export const Kind = Symbol.for("fabricator:kind");
export const Meta = Symbol.for("fabricator:meta");
export const Produces = Symbol.for("fabricator:produces");
export const Replace = Symbol.for("fabricator:replace");
export const Fixed = Symbol.for("fabricator:fixed");

/**
 * Tags a `Seed` as composing onto whatever base is in effect, rather than
 * replacing it — the reading a bare `seed` has everywhere else in this library.
 * `layer()` (`Random/index.ts`) is the only producer; a caller never names this
 * symbol, mirroring `[Replace]`. Unlike every other symbol in this file, it
 * tags a config value (a `Seed`), not a Schema or Fabricator — see
 * `Random/Types.ts`'s `Layered`.
 */
export const Layer = Symbol.for("fabricator:layer");

/**
 * The Fabricators that exist at build time — whatever `Constructor.ts`'s `make`
 * already constructed for this node's nested schemas before handing them to the
 * kind's own `Fabricator()` factory. Every composite kind whose construction
 * receives already-dispatched Fabricators carries this: `object` (its `Fields`
 * map), `tuple` (`elements`, in slot order), `choice` (the dispatched options,
 * in `[Meta].items` order — weights stay in `[Meta]`), `array` (the single
 * shared `element`), `record` (`{ key, value }`), and each of
 * `nullable`/`nullish`/`undefinable`/`object.omittable`/`object.optional` (the
 * single wrapped `source`).
 *
 * The payload shape is kind-private, exactly as `[Meta]` is — nothing outside a
 * kind's own files interprets another kind's `[Children]` shape.
 *
 * `recursive` carries none: its expansions are a function of draws made
 * _during_ `fabricate()` (`recursive/Fabricator.ts`), one throwaway Fabricator
 * per `self` occurrence, so there is no stable child at build time to point at.
 * `body`/`terminal` are already on `[Meta]` as ordinary sub-Schemas for
 * anything that needs to introspect them.
 */
export const Children = Symbol.for("fabricator:children");

/**
 * A per-library map of external-schema overrides (`{ typebox: (schema) =>
 * TSchema }`), written by every kind's `.adapt(adapter, produce)` builder
 * method and read only by `src/Adapter/*` — completely inert for fabrication,
 * which never looks at it. A map rather than a single function so one schema
 * can map to several external libraries at once; see `Adapter/Types.ts` for the
 * registry of supported libraries, and `Adapter/TypeBox`'s
 * `ToTypeBox`/`convert` for the reading end.
 */
export const Adaptation = Symbol.for("fabricator:adaptation");

/**
 * A public sentinel with two uses that share one meaning — "this key does not
 * appear in the fabricated object": `object.omittable`'s and
 * `object.optional`'s Fabricators return it internally when their roll lands on
 * absence (read by `object/Fabricator.ts`'s fabricate loop, never surfaced to a
 * caller fabricating normally), and it is also the value a caller passes in
 * `.override(...)`/`.fabricate(overrides)` to force an omittable or optional
 * field off — `{ a: undefined }` present-as-`undefined` is not expressible this
 * way, since that would conflate with a genuinely present-but-`undefined` value
 * (see `Primitive/undefined`, and `Primitive/object/optional`, which
 * distinguishes the two outcomes).
 */
export const Omitted = Symbol.for("fabricator:omitted");

/**
 * Everything `construct()`/`toTypeBox()` accept as a starting point: a
 * not-yet-built Schema, or something already built into a Fabricator.
 */
export type Buildable = AnySchema | Fabricator<any>;

/**
 * The span of valid `Date` time values: ±8.64e15 ms from the epoch. An
 * ECMAScript spec fact (`Date`'s own representable range), not a `date`-kind
 * detail — lives here rather than in `Primitive/date/` so `Random/index.ts`'s
 * `deriveClock` can use it without importing from `Primitive/`.
 */
export const MAX_TIME = 8_640_000_000_000_000;
