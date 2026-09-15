import { initialize } from "@ghostry/fabricator";
import {
  integration,
  type FabricatorTestContext,
  type Frame,
  type FrameArgs,
  type Identity,
  type Integration,
  type ProviderArgs,
  type Wrapper,
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
  Expect<Equal<typeof wired, Integration<TestContext, typeof instance>>>,
  Expect<Equal<keyof (typeof wired)["provides"], "fabricator">>,
  Expect<Equal<ReturnType<Provided>, typeof instance>>,
  /**
   * The provider takes one object, and the established value in it is the
   * scoped instance — which is what removes the mutable slot the provider used
   * to read. If those drift apart, the provider is reading something its own
   * wrapper did not establish.
   */
  Expect<Equal<Parameters<Provided>[0], ProviderArgs<typeof instance>>>,
  Expect<Equal<Parameters<Provided>[0]["identity"], Identity>>,
  Expect<Equal<Parameters<Provided>[0]["established"], typeof instance>>,
  /** A provider's object is the frame's, plus what the wrapper established. */
  Expect<Equal<FrameArgs, { readonly identity: Identity }>>,
  Expect<
    Equal<
      ProviderArgs<string>,
      { readonly identity: Identity } & { readonly established: string }
    >
  >,
  /**
   * The bound `@ghostry/harness`'s `initialize` checks an `integrations` array
   * against (its `AnyIntegration`). Not `object`: `keyof object` is `never`.
   */
  Expect<
    typeof wired extends Integration<Record<string, unknown>, typeof instance>
      ? true
      : false
  >,
  /**
   * Pin `Integration`'s shape — `frame` required — so a change to what this
   * integration claims to be is a deliberate edit here.
   */
  Expect<
    Equal<
      Integration<{ readonly value: number }, string>,
      {
        readonly name: string;
        readonly provides: {
          readonly value: (args: ProviderArgs<string>) => number;
        };
        frame(args: FrameArgs): Frame<string>;
      }
    >
  >,
  /**
   * `Frame` declares only the synchronous generator. `@ghostry/harness` accepts
   * an `AsyncGenerator` too, and the narrower type still satisfies the wider
   * one; widening it here would be the edit that lets an integration promote
   * every test in the suite to a promise.
   */
  Expect<
    Equal<Frame<string>, Generator<Wrapper<string> | void, void, unknown>>
  >,
  /** The wrapper hands the body what it established, and returns it unchanged. */
  Expect<
    Equal<
      ReturnType<Wrapper<string>>,
      ReturnType<Parameters<Wrapper<string>>[0]>
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
