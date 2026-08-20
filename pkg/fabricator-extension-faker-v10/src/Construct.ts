import type { Faker } from "@faker-js/faker";
import type { ProduceContext } from "@ghostry/fabricator";
import { build } from "./FakerModules/Build";
import type { FakerExtension, Registry } from "./Types";

/**
 * Builds the whole `faker` namespace — every module and method
 * `FakerModules/Build.ts` covers, including `color`'s text/channels split —
 * against one shared `Faker` instance, plus the `use` hatch below.
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
  faker: Faker,
  draw: <$T>(produce: () => $T) => (context: ProduceContext) => $T,
): FakerExtension {
  return {
    ...build(T, faker, draw),

    /**
     * Escape hatch — see `Types.ts`'s `FakerExtension.use` for why it is a
     * namespace rather than a callable. Each form is a thin `draw`-wrapped
     * pass-through to the shared `Faker`, differing only in which core kind's
     * `.as()` receives the result; `.opaque` needs no cast, since `T.opaque`'s
     * `$T` is inferred from `produce`'s return type exactly as `use.opaque`'s
     * is.
     */
    use: {
      string: (produce) => T.string.as(draw(() => produce(faker))),
      number: (produce) => T.number.as(draw(() => produce(faker))),
      date: (produce) => T.date.as(draw(() => produce(faker))),
      boolean: (produce) => T.boolean.as(draw(() => produce(faker))),
      bigint: (produce) => T.bigint.as(draw(() => produce(faker))),
      opaque: (produce) => T.opaque(draw(() => produce(faker))),
    },
  };
}
