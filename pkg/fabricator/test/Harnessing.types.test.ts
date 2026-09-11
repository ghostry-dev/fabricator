import { initialize } from "@ghostry/fabricator";
import {
  integration,
  type FabricatorTestContext,
  type Identity,
  type Integration,
} from "@ghostry/fabricator/harnessing";

/**
 * Compile-time assertions — see `Fabrication.types.test.ts` for why `Equal`/
 * `Expect` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;

const instance = initialize({
  salt: "testing-types",
  clock: new Date("2024-01-01T00:00:00.000Z"),
});
const wired = integration(instance);

type TestContext = FabricatorTestContext<typeof instance.T>;
type Provided = (typeof wired)["provides"]["fabricator"];

export type Assertions = [
  /**
   * `integration(instance)` is an `Integration` whose context is the instance
   * itself, under the `fabricator` key — and that key alone.
   */
  Expect<Equal<typeof wired, Integration<TestContext>>>,
  Expect<Equal<keyof (typeof wired)["provides"], "fabricator">>,
  Expect<Equal<ReturnType<Provided>, typeof instance>>,
  Expect<Equal<Parameters<Provided>[0], Identity>>,
  /**
   * The bound `@ghostry/harness`'s `initialize` checks an `integrations` array
   * against (its `AnyIntegration`). Not `object`: `keyof object` is `never`.
   */
  Expect<
    typeof wired extends Integration<Record<string, unknown>> ? true : false
  >,
  /**
   * Pin `Integration`'s shape — `around` required, no `setup` — so a change to
   * what this integration claims to be is a deliberate edit here.
   */
  Expect<
    Equal<
      Integration<{ readonly value: number }>,
      {
        readonly name: string;
        readonly provides: { readonly value: (identity: Identity) => number };
        around<$Return>(identity: Identity, body: () => $Return): $Return;
      }
    >
  >,
  /**
   * Pin `Identity`'s shape so a field rename or a `row` made optional (rather
   * than `number | undefined`) fails here rather than in a second package
   * written against this copy.
   */
  Expect<
    Equal<
      Identity,
      {
        readonly kind: "test" | "suite";
        readonly path: ReadonlyArray<string>;
        readonly name: string;
        readonly row: number | undefined;
      }
    >
  >,
];
