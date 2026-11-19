import type { Faker } from "@faker-js/faker";
import type { ProduceContext } from "@ghostry/fabricator";
import { build } from "./FakerModules/Build.ts";
import type { FakerExtension, Registry } from "./Types.ts";

/**
 * Builds the whole `faker` namespace — every module and method
 * `FakerModules/Build.ts` covers, including `color`'s text/channels split —
 * against one shared `Faker` instance, plus the `use` hatch below. `instance`
 * builds that instance on first call; every call is inside a producer, so
 * constructing the namespace loads nothing.
 *
 * Built eagerly as a plain nested object, never a `Proxy`: `registry.extend`'s
 * `deepMerge` only recurses where `isPlainObject` holds, and a `Proxy` over
 * `{}` passes that check while defeating `Object.keys`, the same trap
 * `T.record`'s `"__proto__"` guard exists to avoid on the fabrication side.
 *
 * Nothing here is cast. `build`'s `FakerModules` annotation checks the module
 * half against `FakerModules/Types.ts`, and this function's return type checks
 * that the module half and `use` together are exactly `FakerExtension` — a
 * mismatch between what the mirror builds and what the surface declares is a
 * compile error, not something a cast absorbs.
 *
 * The one place the plain-object/bare-function invariant is upheld at assembly
 * rather than within a single file, which is why `Deviation.test.ts` keeps a
 * runtime floor on the builder count: the type-level guards read the surface
 * alone and cannot see a spread that drops a module.
 */
export function construct(
  T: Registry,
  instance: () => Faker,
  draw: <$T>(
    produce: (context: ProduceContext) => $T,
  ) => (context: ProduceContext) => $T,
): FakerExtension {
  return {
    ...build(T, instance, draw),

    /**
     * Escape hatch — see `Types.ts`'s `FakerExtension.use` for why it is a
     * namespace rather than a callable. Each form is a thin `draw`-wrapped
     * pass-through to the shared `Faker`, differing only in which core kind's
     * `.as()` receives the result; `.opaque` needs no cast, since `T.opaque`'s
     * `$T` is inferred from `produce`'s return type exactly as `use.opaque`'s
     * is.
     */
    use: {
      string: (produce) => T.string.as(draw(() => produce(instance()))),
      number: (produce) => T.number.as(draw(() => produce(instance()))),
      date: (produce) => T.date.as(draw(() => produce(instance()))),
      boolean: (produce) => T.boolean.as(draw(() => produce(instance()))),
      bigint: (produce) => T.bigint.as(draw(() => produce(instance()))),
      opaque: (produce) => T.opaque(draw(() => produce(instance()))),
    },
  };
}
