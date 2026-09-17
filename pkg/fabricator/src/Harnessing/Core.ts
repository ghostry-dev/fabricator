import { FabricatorError } from "../Error";
import type { Instance } from "../Instance/Types";
import { layer } from "../Random";
import type { PlainObject } from "../Utility/Types";
import { saltFor } from "./Salt";
import type { FabricatorTestContext, FrameArgs, Integration } from "./Types";

/**
 * Decorate an existing `Instance` as a `@ghostry/harness` integration. The
 * whole of it is `context.scope().wrap({ salt: layer(saltFor(identity)) })` —
 * one line of real work. Construction ordinals therefore restart per test (each
 * `wrap` re-instantiates), which is what makes `.only`, filters, shards, and
 * `.concurrent` unable to shift a neighbor's data. That per-test partitioning
 * is also why the salt needs no file in it; see `saltFor`
 * (`Harnessing/Salt.ts`).
 *
 * `frame` is a generator so that `yield` can be both where the body runs and
 * where this hook waits. There is nothing after the `yield` here: fabricator
 * has no teardown, and the `AsyncLocalStorage` carrier keeps the ambient frame
 * alive across the body's `await`s on its own. What the `yield` carries is the
 * wrapper, because the ambient frame has to _enclose_ the body rather than
 * merely precede it. On the synchronous carrier an async body still raises
 * `SynchronousStackError` from `wrap`.
 *
 * `body` is handed to `wrap` directly rather than called inside a closure.
 * `wrap(overlay, block)` already takes `(scope) => $Return`, which is exactly
 * the wrapper's own `(established) => $Return`, so the scope `wrap` opens _is_
 * the established value with nothing in between to adapt it.
 *
 * `context.scope()`, not `instance`, is the receiver. A plain `instance.wrap`
 * lays its overlay over the instance it was called on, and that receiver is
 * bound before any test runs — so an integration composed _inside_ another
 * library's fabricator scope would restate from the configured instance and
 * drop that enclosing scope entirely, silently, while still landing innermost
 * and therefore governing every draw. `context.scope()` is the frame in effect,
 * or the instance itself when there is none, which is this integration's
 * contract in both cases with no branch. Called fresh here rather than hoisted:
 * `scope` is a function so that capturing it captures the lookup, where a
 * captured result would pin one frame.
 *
 * The per-test wrap is entered on `context.scope()`, so it governs that
 * instance and its ancestors: the integrated instance when nothing encloses it,
 * and that instance as an ancestor of the enclosing scope when something does.
 * It does not govern forks of the integrated instance. Per-test data therefore
 * comes from the instance handed to `integration(...)`, from
 * `context.fabricator`, or from a fork of that scope — a module-level fork of
 * the integrated instance draws the same data in every test, and because its
 * construction counter runs across tests, which values a test gets depends on
 * which tests ran before it.
 *
 * `provides.fabricator` is then that scope — the instance `wrap` gave its
 * block, not the base instance — so `context.fabricator.salt` is the per-test
 * salt and `.fork()` forks from the test's configuration. Nothing mediates
 * between the two: the wrapper hands the scope forward and the provider
 * receives it. A provider reached with no established scope is a composer
 * running providers outside the frame it opened, and raises
 * `HarnessingProviderError` rather than quietly providing the base instance.
 *
 * Nothing here sets `clock`. A pinned `Date` (the recommended setup) and the
 * wall-clock default are already concrete numbers by the time `overlay()` sees
 * them, so they inherit through every `wrap` — the frame in effect's included:
 * salt varies per test, "now" does not. `clock: "derived"` is left alone on
 * purpose — that policy's documented meaning is that the salt _is_ the
 * reproducibility unit, so per-test clocks are the request honored, not a bug
 * to override.
 */
export function integration<$Registry extends PlainObject>(
  instance: Instance<$Registry>,
): Integration<FabricatorTestContext<$Registry>, Instance<$Registry>> {
  return {
    name: "@ghostry/fabricator",
    provides: {
      fabricator: ({ established: instance }) => {
        if (typeof instance === "undefined") {
          throw new FabricatorError.HarnessingProviderError();
        }
        return instance;
      },
    },
    *frame({ identity }: FrameArgs) {
      const salt = layer(saltFor(identity));
      yield (body) => instance.context.scope().wrap({ salt }, body);
    },
  };
}
