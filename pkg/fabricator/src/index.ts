import type { Limits } from "./Enumeration/Types";
import { toStack } from "#stack";
import { instantiate, overlay } from "./Instance/Core";
import type { Instance, Stack } from "./Instance/Types";
import type { Algorithm, Salt } from "./Random/Types";
import { registry } from "./Schema/Registry";
import type { PlainObject } from "./Utility/Types";

export function initialize<
  const $Registry extends PlainObject = typeof registry,
>(
  config?: Partial<{
    /** The registry of type definers to use — `registry` itself. */
    types: $Registry;

    /**
     * Optional differentiator composed into every stream beside `clock` — it
     * distinguishes runs, it does not generate them. Accepts a single string,
     * or several — several lets a salt be composed out of independent,
     * meaningful parts (a user id, a scenario label) without hand-joining them
     * first. If omitted, the salt is empty (unless `FABRICATOR_SALT` supplies
     * one): wall-clock `clock` is the default entropy, so an unconfigured
     * instance varies by run and replays from `context.clock` alone. Pass a
     * salt when two instances should share a clock but draw different
     * universes, or when `clock: "derived"` should make the salt itself the
     * reproducibility unit.
     */
    salt?: Salt;

    /**
     * Bring your own PRNG: a factory that, given a seed, returns a source of
     * randomness — a `() => number` in `[0, 1)`, a drop-in for `Math.random`.
     * The seed is a whole encoded trace, of which `salt` is one slot, not the
     * `salt` itself. Defaults to the built-in `sfc32` generator.
     */
    algorithm?: Algorithm;

    /**
     * Instance-wide numeric ceilings. `combinatorial` bounds how many instances
     * `combinatorial(...)` may enumerate — the check is eager, it throws at
     * call time before any instance is produced. Defaults to 1024 if omitted.
     * `coverage(...)` carries no entry here: its count is the widest single
     * axis, so there is nothing for a limit to protect against.
     */
    limits?: Limits;

    /**
     * What `T.date.past`/`T.date.future` (and any producer reading
     * `ProduceContext.clock`) resolve "now" against — and, because it sits in
     * every leaf's trace, the default entropy for the instance. Defaults to the
     * wall-clock instant of this `initialize()` call, so an unconfigured run
     * has realistic dates and varies by process, and replays from
     * `context.clock` (with the same empty or supplied `salt`). Pass a fixed
     * `Date` to freeze "now" (and the rest of the run, unless `salt` also
     * differs). Pass `"derived"` to derive "now" from the instance salt instead
     * — an instant drawn across the whole representable `Date` span, so an
     * implausible date is the expected outcome of that policy, not a bug.
     * `"derived"` is what makes `salt` alone the reproducibility unit.
     */
    clock?: Date | "derived";

    /**
     * The ambient carrier backing `wrap` for this lineage — override only to
     * force a specific one.
     *
     * Left unset (the norm), the `#stack` package import picks it: every
     * runtime with `node:async_hooks` — Node, Bun, Deno — gets the
     * `AsyncLocalStorage` carrier, whose frames survive `await` and isolate
     * concurrent `wrap`s; anywhere else falls back to a synchronous LIFO, on
     * which `wrap` rejects an async block rather than silently resolving a
     * later build against this instance. Supplying one is how a test drives the
     * carrier it did not get by condition.
     */
    stack?: Stack;
  }>,
): Instance<$Registry> {
  return instantiate(
    overlay<$Registry>({}, config ?? {}),
    config?.stack ?? toStack(),
  ).instance;
}

export { Omitted } from "./Types";
/**
 * Tags a `Salt` — for `new Fabricator(schema, { salt })`, or `fork`'s own
 * `Overlay.salt` — as composing onto whatever base is in effect, rather than
 * replacing it outright.
 */
export { layer } from "./Random";
/**
 * `layer(...)`'s return type, so a caller building one programmatically can
 * name it — the same rationale as the existing `Salt` export.
 */
export type { Layered } from "./Random/Types";
/**
 * Every failure this library raises is an instance of this class — see
 * `src/Error/index.ts` for the full hierarchy. Only the base is public;
 * subclasses are distinguished by `.name`.
 */
export { FabricatorError } from "./Error";
/**
 * The default registry of type definers, exported so it can be extended via
 * `registry.extend(({ T }) => ({ ... }))` before being passed to `initialize({
 * types })`.
 */
export { registry } from "./Schema/Registry";
/**
 * Canonical `{ value, exclusive }` endpoint stored on `whereby` min/max, plus
 * the call-site union that still accepts a scalar (inclusive). Exported so a
 * named `.whereby(...)` argument or an `.adapt` producer reading `meta` can
 * type it — the same rationale as `Stream`.
 */
export { effectiveDiscrete, toBound } from "./Bound";
export type { Bound, InputBound } from "./Bound";
/**
 * Public because it is the type of `ProduceContext`'s `random` member — the
 * seeded stream every kind's `.as(produce)` and `T.opaque`'s producer are
 * handed — so a caller writing either as a named function can name it.
 */
export type { Stream } from "./Random/Types";
/**
 * What every kind's `.as(produce)` producer is called with — a single curated
 * object rather than a positional argument list, so a caller writing the
 * producer as a named function can name its parameter. `T.opaque`'s producer
 * takes the same shape.
 */
export type { ProduceContext } from "./Random/Types";
/**
 * What every kind's `.adapt(adapter, produce)` producer is called with — `{
 * schema, meta }` — the same rationale as `Stream`/`ProduceContext` above: a
 * caller writing the producer as a named function can name its parameter.
 * `meta` is the kind's own config, reachable here without importing the `Meta`
 * well-known symbol from `@ghostry/fabricator/internal` — that symbol stays off
 * the path an ordinary caller writing an `.adapt()` call has to walk. The rest
 * of the adapter contract (`walk`, `Adapter`, `Adaptation`, `Adaptations`,
 * `AdaptationsOf`, `Recurse`) is exported from `@ghostry/fabricator/adapting`
 * instead — surface for implementing an adapter, not for calling `.adapt()`.
 */
export type { Adapting } from "./Adapter/Types";
/**
 * The shape `initialize({ salt })` and `new Fabricator(schema, { salt })` both
 * accept — a single string, or several — so a caller building one
 * programmatically (rather than as an inline literal) can name the type.
 */
export type { Salt } from "./Random/Types";
/**
 * Reads the value type a built Fabricator produces straight off its `fabricate`
 * signature — `Fabrication<typeof Product>` instead of `ReturnType<typeof
 * Product.fabricate>`.
 */
export type { Fabrication } from "./Fabricator/Types";
/**
 * Reads the value type a Schema (not yet built) will eventually produce, via
 * its phantom `[Produces]` marker. Mostly useful for a helper that accepts a
 * Schema before it's built into a Fabricator.
 */
export type { ValueOf } from "./Schema/Types";
/**
 * `fabricator.trace`'s type — otherwise unnameable by a caller wanting to hold
 * onto one, the same reason `Stream` is exported above.
 */
export type { Trace } from "./Random/Types";
/**
 * `fork`/`wrap`'s own config shapes, so a caller building an overlay
 * programmatically (rather than as an inline literal) can name them — the same
 * rationale as the existing `Salt` export. `Config` is what `initialize`'s own
 * parameter is a `Partial` of; `Overlay` is what `fork`/`wrap` accept;
 * `Context` is `instance.context`'s own type, so a caller writing a helper that
 * reads it can name the parameter.
 */
export type { Config, Context, Overlay, Stack } from "./Instance/Types";
