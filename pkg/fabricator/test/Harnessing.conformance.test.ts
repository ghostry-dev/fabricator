/**
 * `Harnessing/Types.ts` declares `@ghostry/harness`'s contract rather than
 * importing it, so that neither package depends on the other. That is the right
 * arrangement, and it has one consequence this file exists to cover: **nothing
 * otherwise checks that the two still agree.** A contract change on the harness
 * side leaves this package compiling perfectly and failing only in a user's
 * suite, at runtime, in a third repository.
 *
 * So `@ghostry/harness` is a **devDependency** — never a `dependency` or a
 * `peerDependency`. A consumer installs neither it nor this file; the `files`
 * allowlist ships `dist` alone. The independence the declaration protects is
 * preserved, and the drift it invites is caught here at build time.
 *
 * Assignability in the direction that matters: what `integration()` builds must
 * satisfy what `initialize()` accepts. The reverse is deliberately untrue —
 * `Frame` here is only the synchronous generator, and `frame` is required
 * rather than optional.
 *
 * @module
 */

import { initialize } from "@ghostry/fabricator";
import {
  integration,
  type FabricatorTestContext,
  type Frame,
  type FrameArgs,
  type Identity,
  type ProviderArgs,
  type Wrapper,
} from "@ghostry/fabricator/harnessing";
import type {
  AnyIntegration,
  Frame as HarnessFrame,
  FrameArgs as HarnessFrameArgs,
  Identity as HarnessIdentity,
  Integration as HarnessIntegration,
  ProviderArgs as HarnessProviderArgs,
  Wrapper as HarnessWrapper,
} from "@ghostry/harness";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;

const instance = initialize({
  salt: "conformance-types",
  clock: new Date("2024-01-01T00:00:00.000Z"),
});

const wired = integration(instance);

type Scoped = typeof instance;
type TestContext = FabricatorTestContext<Scoped["T"]>;

export type Assertions = [
  /**
   * The load-bearing one. Everything below narrows _why_ this holds, so that a
   * break reports against the specific member that drifted rather than against
   * the whole integration.
   */
  Expect<
    typeof wired extends HarnessIntegration<TestContext, Scoped> ? true : false
  >,

  /**
   * And the shape `initialize` actually checks an `integrations` array against.
   * `AnyIntegration` is the erased bound, so an integration that satisfies the
   * precise type but not this one would still be rejected at the call site.
   */
  Expect<typeof wired extends AnyIntegration ? true : false>,

  /**
   * `Identity` is the one type copied field for field, and the one a rename
   * would silently break: `saltFor` derives the per-test salt from it, so a
   * field that stops arriving degrades reproducibility rather than failing.
   */
  Expect<Equal<Identity, HarnessIdentity>>,

  /** What harness hands the frame, and what it hands each provider. */
  Expect<Equal<FrameArgs, HarnessFrameArgs>>,
  Expect<Equal<ProviderArgs<Scoped>, HarnessProviderArgs<Scoped>>>,

  /**
   * The wrapper is the channel the scoped instance travels down, from `wrap` to
   * the provider. A change to its arity or its return would sever that.
   */
  Expect<Equal<Wrapper<Scoped>, HarnessWrapper<Scoped>>>,

  /**
   * Not `Equal`: this package declares only the synchronous generator, and
   * harness accepts an `AsyncGenerator` too. The narrower must satisfy the
   * wider, which is exactly the direction asserted — and the direction that
   * keeps this integration from promoting every test in a suite to a promise.
   */
  Expect<Frame<Scoped> extends HarnessFrame<Scoped> ? true : false>,
  Expect<
    Equal<HarnessFrame<Scoped> extends Frame<Scoped> ? true : false, false>
  >,
];
