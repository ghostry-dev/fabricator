import type { LocaleDefinition, Randomizer } from "@faker-js/faker";
import { Faker } from "@faker-js/faker";
import type { ProduceContext } from "@ghostry/fabricator";
import { construct } from "./Construct";
import { FakerExtensionError } from "./Error";
import type { FakerExtension, Registry } from "./Types";

export { FakerExtensionError } from "./Error";
export type { FakerExtension as FakerTypes } from "./Types";

/**
 * The mirror's type-level machinery — not needed to *use* it, but exported
 * so a consumer (or this package's compile-time checks in
 * `test/index.types.test.ts`) can name a module or method without a relative
 * `./Types` path tests otherwise avoid (`CLAUDE.md`: tests resolve through
 * the package specifier, exercising built `dist/`).
 *
 * `FakerModules` is the surface those checks are made *against* — every
 * builder's declared parameters and return Schema — so `Honest<...>` reads
 * the shipped contract, not an intermediate description.
 */
export type { FakerModules } from "./FakerModules/Types";
export type { MethodName, ModuleName } from "./Types";

/**
 * Faker's configuration bag — re-exported so `Options.config` doesn't need
 * `@faker-js/faker` as a direct dependency just to name the type.
 */
export type FakerConfig = ConstructorParameters<typeof Faker>[0]["config"];

/**
 * No reference-date option. `Faker`'s `defaultRefDate` is wired to the
 * active fabrication's `clock` (below), so a second independently-configured
 * clock would be a second source of truth free to drift from `T.date.past`
 * in the same schema.
 *
 * No `seed` option and no pre-built `Faker`: a pre-built instance's
 * randomizer is fixed at construction, and accepting one would either ignore
 * it silently or let it compete with fabricator's seed. `create` is the
 * honest escape: the caller builds the instance; it still receives this
 * bridge's `randomizer`, so reproducibility survives.
 */
export type Options =
  | {
      locale: LocaleDefinition | LocaleDefinition[];
      config?: FakerConfig | undefined;
      create?: never;
    }
  | {
      create: (randomizer: Randomizer) => Faker;
      locale?: never;
      config?: never;
    };

/**
 * The `ProduceContext` of the leaf currently being fabricated. `undefined`
 * whenever no faker builder's producer is on the call stack. One slot, not
 * one per concern: `random` and `clock` always arrive together on one
 * `ProduceContext`. Both of faker's configurable inputs (randomizer,
 * reference date) read through this one reference, so they can never
 * disagree about which fabrication they are serving.
 */
let scope: ProduceContext | undefined;

const current = (): ProduceContext => {
  if (scope === undefined) throw new FakerExtensionError.NoActiveScopeError();
  return scope;
};

const randomizer: Randomizer = {
  next: () => current().random.next(),
  /**
   * Deliberately inert. `new Faker(...)` seeds its randomizer during
   * construction, and `faker.seed(...)` is reachable through `use` — honoring
   * either would put a second seed in competition with fabricator's, which
   * is the bug this package exists to remove.
   */
  seed: () => {},
};

/**
 * Shared `Faker` instance the builders draw from. Wired once, at
 * construction, not per draw: `setDefaultRefDate` takes a `() => Date`
 * source, so a `wrap({ clock }, ...)` active at fabricate time is picked up
 * through `current().clock` with nothing to re-push.
 */
function toFaker(options: Options): Faker {
  if (options.create) return options.create(randomizer);

  const faker = new Faker({
    locale: options.locale,
    randomizer,
    ...(options.config ? { config: options.config } : {}),
  });

  /**
   * `ProduceContext.clock` is epoch milliseconds, resolved once per
   * fabrication; faker's `defaultRefDate` wants a `() => Date`. This is why
   * `T.faker.date.past()` and core's `T.date.past` agree on "now" within one
   * schema — both resolve against the same instance clock.
   */
  faker.setDefaultRefDate(() => new Date(current().clock));

  return faker;
}

/**
 * Wraps a faker call so it runs against this fabrication's `random`/`clock`
 * rather than whatever fabrication (if any) was previously active.
 * Save/restore, not bare assignment: a faker method taking a user callback
 * that itself reaches a nested `fabricate()` must unwind to *this* leaf's
 * scope, not to "none". Sound only because faker is synchronous and a
 * producer runs synchronously inside `fabricate()` — an async faker method
 * on a future major is a re-examination, not a tweak.
 */
function draw<$T>(produce: () => $T): (context: ProduceContext) => $T {
  return (context) => {
    const previous = scope;
    scope = context;
    try {
      return produce();
    } finally {
      scope = previous;
    }
  };
}

/**
 * Returns a `registry.extend` callback rather than the namespace itself, so
 * faker's builders arrive as `T.faker.*` on an ordinary extended registry —
 * the same path any user-defined type uses, and what gives every builder
 * access to the core kinds it wraps:
 *
 * ```ts
 * const { T, Fabricator } = initialize({
 *   types: registry.extend(fakerExtension({ locale: en })),
 * });
 *
 * T.object({ name: T.faker.person.fullName() });
 * ```
 *
 * The `Faker` instance is built here, once per `fakerExtension(...)` call,
 * not per `extend` — so a configuration error (an empty `locale`) surfaces
 * at the call the caller wrote, not inside the registry machinery.
 *
 * `FakerExtension` (`./Types.ts`) is spelled out explicitly rather than
 * inferred. An inferred type would reach into each kind's `Schema`
 * interface — internal to `@ghostry/fabricator`, unreachable from its `.`
 * export — and declaration emission (`tsgo`, not `tsc --noEmit`; see
 * `CLAUDE.md`'s declaration-emit trap) refuses to print an anonymous
 * expansion of one. Even where it printed it would be the wrong contract:
 * inference would surface each builder's incidental narrowness
 * (`Schema<{ produce; hints }>`) where the declared surface states
 * `Primitive.string.Schema`.
 *
 * Every node is a plain object or a leaf builder function, never a function
 * carrying properties: `deepMerge` recurses only where `isPlainObject` holds
 * on both sides, so a callable-with-properties silently swallows any later
 * `.extend()` aimed into it. `Construct.ts` upholds this at runtime;
 * `Types.ts`'s `FakerExtension` is the type-level mirror.
 */
export function fakerExtension(
  options: Options,
): (params: { T: Registry }) => { faker: FakerExtension } {
  const faker = toFaker(options);

  return ({ T }) => ({ faker: construct(T, faker, draw) });
}
