import type {
  allLocales,
  Faker,
  LocaleDefinition,
  Randomizer,
} from "@faker-js/faker";
import type { ProduceContext } from "@ghostry/fabricator";
import { isArray } from "@ghostry/fabricator/internal";
import { load } from "#load";
import { construct } from "./Construct.ts";
import { FakerExtensionError } from "./Error.ts";
import type { FakerExtension, Registry } from "./Types.ts";

export { FakerExtensionError } from "./Error.ts";
export type { FakerExtension as FakerTypes } from "./Types.ts";

/**
 * The mirror's type-level machinery — not needed to _use_ it, but exported so a
 * consumer (or this package's compile-time checks in
 * `test/index.types.test.ts`) can name a module or method without a relative
 * `./Types` path tests otherwise avoid (`AGENTS.md`: tests resolve through the
 * package specifier, exercising built `dist/`).
 *
 * `FakerModules` is the surface those checks are made _against_ — every
 * builder's declared parameters and return Schema — so `Honest<...>` reads the
 * shipped contract, not an intermediate description.
 */
export type { FakerModules } from "./FakerModules/Types.ts";
export type { MethodName, ModuleName } from "./Types.ts";

/**
 * Faker's configuration bag — re-exported so `Options.config` doesn't need
 * `@faker-js/faker` as a direct dependency just to name the type.
 */
export type FakerConfig = ConstructorParameters<typeof Faker>[0]["config"];

/**
 * A locale faker defines, by name — a key of faker's `allLocales`. Naming a
 * locale rather than importing its data is what keeps the data out of every
 * module that builds schemas: the name is resolved when faker is loaded, at the
 * first draw (see {@link fakerExtension}).
 */
export type LocaleName = keyof typeof allLocales;

/**
 * One entry of `Options.locale`: a name, or a `LocaleDefinition` object such as
 * faker's own `en`. An object is a static reference to that locale's data, so
 * it bundles wherever the module passing it does.
 */
export type Locale = LocaleName | LocaleDefinition;

/**
 * No reference-date option. `Faker`'s `defaultRefDate` is wired to the active
 * fabrication's `clock` (below), so a second independently-configured clock
 * would be a second source of truth free to drift from `T.date.past` in the
 * same schema.
 *
 * No `seed` option and no pre-built `Faker`: a pre-built instance's randomizer
 * is fixed at construction, and accepting one would either ignore it silently
 * or let it compete with fabricator's seeding. `create` is the honest escape:
 * the caller builds the instance; it still receives this bridge's `randomizer`,
 * so reproducibility survives.
 *
 * `locale` loads faker through `#load`, which a browser bundle resolves to a
 * loader that throws. `create` loads nothing — the caller imports faker — so it
 * is the form for a bundle that fabricates in a browser.
 */
export type Options =
  | {
      locale: Locale | ReadonlyArray<Locale>;
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
 * whenever no faker builder's producer is on the call stack. One slot, not one
 * per concern: `random` and `clock` always arrive together on one
 * `ProduceContext`. Both of faker's configurable inputs (randomizer, reference
 * date) read through this one reference, so they can never disagree about which
 * fabrication they are serving.
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
   * either would put a second seed in competition with fabricator's, which is
   * the bug this package exists to remove.
   */
  seed: () => {},
};

/**
 * The `Faker` instance one `fakerExtension(...)` call's builders draw from,
 * built on first use. Wired once, at construction, not per draw:
 * `setDefaultRefDate` takes a `() => Date` source, so a `wrap({ clock }, ...)`
 * active at fabricate time is picked up through `current().clock` with nothing
 * to re-push.
 *
 * Lazy for the `locale` form because building it means loading faker, which
 * only a draw needs — building schemas and adapting them never reaches here.
 * The first call runs inside a producer, so loading and constructing happen
 * within a leaf's scope; neither draws randomness (`seed` is inert, and `new
 * Faker` reads nothing from its randomizer), so the leaf's stream is exactly
 * what it would be with the instance built ahead of time. A throw is never
 * kept: a failed load or construction throws again on the next draw.
 *
 * `create` runs immediately instead. It loads nothing — the caller imported
 * faker to write it — so there is nothing to defer, and an error in it belongs
 * at the call the caller wrote.
 */
function toInstance(options: Options): () => Faker {
  if (options.create) {
    const faker = options.create(randomizer);
    return () => faker;
  }

  const locales: ReadonlyArray<Locale> = isArray(options.locale)
    ? options.locale
    : [options.locale];
  if (locales.length === 0) throw new FakerExtensionError.EmptyLocaleError();
  const config = options.config;

  let faker: Faker | undefined;

  return () => {
    if (faker !== undefined) return faker;

    const loaded = load();
    const built = new loaded.Faker({
      locale: locales.map((locale) => {
        if (typeof locale !== "string") return locale;
        const definition: LocaleDefinition | undefined = (
          loaded.allLocales as Partial<Record<string, LocaleDefinition>>
        )[locale];
        if (definition === undefined)
          throw new FakerExtensionError.UnknownLocaleError(locale);
        return definition;
      }),
      randomizer,
      ...(config ? { config } : {}),
    });

    /**
     * `ProduceContext.clock` is epoch milliseconds, resolved once per
     * fabrication; faker's `defaultRefDate` wants a `() => Date`. This is why
     * `T.faker.date.past()` and core's `T.date.past` agree on "now" within one
     * schema — both resolve against the same instance clock.
     */
    built.setDefaultRefDate(() => new Date(current().clock));

    return (faker = built);
  };
}

/**
 * Wraps a faker call so it runs against this fabrication's `random`/`clock`
 * rather than whatever fabrication (if any) was previously active.
 * Save/restore, not bare assignment: a faker method taking a user callback that
 * itself reaches a nested `fabricate()` must unwind to _this_ leaf's scope, not
 * to "none". Sound only because faker is synchronous and a producer runs
 * synchronously inside `fabricate()` — an async faker method on a future major
 * is a re-examination, not a tweak.
 *
 * `produce` is handed the same `context` for a builder that draws from `random`
 * directly rather than through faker's randomizer (`FakerModules/Words.ts`);
 * both read one stream, so the two can interleave within a single producer.
 */
function draw<$T>(
  produce: (context: ProduceContext) => $T,
): (context: ProduceContext) => $T {
  return (context) => {
    const previous = scope;
    scope = context;
    try {
      return produce(context);
    } finally {
      scope = previous;
    }
  };
}

/**
 * Returns a `registry.extend` callback rather than the namespace itself, so
 * faker's builders arrive as `T.faker.*` on an ordinary extended registry — the
 * same path any user-defined type uses, and what gives every builder access to
 * the core kinds it wraps:
 *
 * ```ts
 * const { T, Fabricator } = initialize({
 *   types: registry.extend(fakerExtension({ locale: en })),
 * });
 *
 * T.object({ name: T.faker.person.fullName() });
 * ```
 *
 * Nothing from `@faker-js/faker` is imported here but types, and a `locale` is
 * a name, so a module that builds the registry references no faker code or
 * data: a bundle that only builds and adapts schemas contains none. Faker is
 * loaded the first time one of this call's builders draws, once per
 * `fakerExtension(...)` call, not per `extend` (see `toInstance`). An empty
 * `locale` still throws here, at the call the caller wrote.
 *
 * `FakerExtension` (`./Types.ts`) is spelled out explicitly rather than
 * inferred. An inferred type would reach into each kind's `Schema` interface —
 * internal to `@ghostry/fabricator`, unreachable from its `.` export — and
 * declaration emission (`tsgo`, not `tsc --noEmit`; see `AGENTS.md`'s
 * declaration-emit trap) refuses to print an anonymous expansion of one. Even
 * where it printed it would be the wrong contract: inference would surface each
 * builder's incidental narrowness (`Schema<{ produce }>`) where the declared
 * surface states `Primitive.string.Schema`.
 *
 * Every node is a plain object or a leaf builder function, never a function
 * carrying properties: `deepMerge` recurses only where `isPlainObject` holds on
 * both sides, so a callable-with-properties silently swallows any later
 * `.extend()` aimed into it. `Construct.ts` upholds this at runtime;
 * `Types.ts`'s `FakerExtension` is the type-level mirror.
 */
export function fakerExtension(
  options: Options,
): (params: { T: Registry }) => { faker: FakerExtension } {
  const instance = toInstance(options);

  return ({ T }) => ({ faker: construct(T, instance, draw) });
}
