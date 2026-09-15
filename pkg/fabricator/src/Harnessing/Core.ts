import { FabricatorError } from "../Error";
import type { Instance } from "../Instance/Types";
import { layer } from "../Random";
import type { PlainObject } from "../Utility/Types";
import { saltFor } from "./Salt";
import type { FabricatorTestContext, FrameArgs, Integration } from "./Types";

/**
 * Decorate an existing `Instance` as a `@ghostry/harness` integration. The
 * whole of it is `instance.wrap({ salt: layer(saltFor(identity)) })` — one line
 * of real work. Construction ordinals therefore restart per test (each `wrap`
 * re-instantiates), which is what makes `.only`, filters, shards, and
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
 * `instance.wrap` is handed to the wrapper directly rather than called inside a
 * closure. `wrap(overlay, block)` already takes `(scope) => $Return`, which is
 * exactly the wrapper's own `(established) => $Return`, so the scope `wrap`
 * opens _is_ the established value with nothing in between to adapt it.
 *
 * `provides.fabricator` is then that scope — the instance `wrap` gave its
 * block, not the base instance — so `context.fabricator.salt` is the per-test
 * salt and `.fork()` forks from the test's configuration. Nothing mediates
 * between the two: the wrapper hands the scope forward and the provider
 * receives it. A provider reached with no established scope is a composer
 * running providers outside the frame it opened, and raises
 * `HarnessingProviderError` rather than quietly providing the base instance.
 *
 * Nothing here reads `instance.context`. The integration is a pure function of
 * the `Identity` it is handed and the instance it decorates, and never sets
 * `clock`. A pinned `Date` (the recommended setup) and the wall-clock default
 * are already concrete numbers by the time `overlay()` sees them, so they
 * inherit through every `wrap` unchanged: salt varies per test, "now" does not.
 * `clock: "derived"` is left alone on purpose — that policy's documented
 * meaning is that the salt _is_ the reproducibility unit, so per-test clocks
 * are the request honored, not a bug to override.
 */
export function integration<$Registry extends PlainObject>(
  instance: Instance<$Registry>,
): Integration<FabricatorTestContext<$Registry>, Instance<$Registry>> {
  return {
    name: "@ghostry/fabricator",
    provides: {
      fabricator: ({ established }) => {
        if (typeof established === "undefined") {
          throw new FabricatorError.HarnessingProviderError();
        }
        return established;
      },
    },
    *frame({ identity }: FrameArgs) {
      const salt = layer(saltFor(identity));
      yield (body) => instance.wrap({ salt }, body);
    },
  };
}
