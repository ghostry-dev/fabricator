import { Type } from "@sinclair/typebox";
import { initialize, registry } from "@ghostry/fabricator";
import type { Fabrication, Primitive } from "@ghostry/fabricator/internal";
import { typebox } from "@ghostry/fabricator-adapter-typebox-v0";

/**
 * Compile-time assertions — see `Fabrication.types.test.ts` in the core
 * package for why `Equal`/`Expect`/`Extends` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Extends<A, B> = A extends B ? true : false;
type Expect<_ extends true> = true;

const { T, Fabricator } = initialize({ types: registry });

/* -------------------------------------------------------------------------- */
/*  Adapting a schema says nothing about what it fabricates (see             */
/*  `Adapter/Types.ts`), so the `$Adaptations` type parameter every kind now   */
/*  carries must be invisible here — asserted for both parameterization       */
/*  styles, since the kinds generic over `$Meta` and those generic over       */
/*  `$Definition` thread it differently.                                     */
/* -------------------------------------------------------------------------- */

const adaptedString = new Fabricator(
  T.string
    .whereby({ length: { max: 4 } })
    .adapt(typebox, () => Type.String({ format: "email" })),
);
const adaptedObject = new Fabricator(
  T.object({ a: T.always(1) }).adapt(typebox, () => Type.Object({})),
);

export type AdaptationDoesNotChangeFabricationAssertions = [
  Expect<Equal<Fabrication<typeof adaptedString>, string>>,
  Expect<Extends<Primitive.object.Fabrication<typeof adaptedObject>, { a: 1 }>>,
  Expect<Extends<{ a: 1 }, Primitive.object.Fabrication<typeof adaptedObject>>>,
  Expect<Extends<typeof adaptedObject, Primitive.object.Fabricator>>,
];
