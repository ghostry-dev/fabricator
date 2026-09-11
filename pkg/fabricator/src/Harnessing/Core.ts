import { FabricatorError } from "../Error";
import type { Instance } from "../Instance/Types";
import { layer } from "../Random";
import type { PlainObject } from "../Utility/Types";
import { saltFor } from "./Salt";
import type { FabricatorTestContext, Identity, Integration } from "./Types";

/**
 * Decorate an existing `Instance` as a `@ghostry/harness` integration.
 * `around(identity, body)` is `instance.wrap({ salt: layer(saltFor(identity))
 * })` — one line of real work. Construction ordinals therefore restart per test
 * (each `wrap` re-instantiates), which is what makes `.only`, filters, shards,
 * and `.concurrent` unable to shift a neighbor's data. That per-test
 * partitioning is also why the salt needs no file in it; see `saltFor`
 * (`Harnessing/Salt.ts`).
 *
 * `around`, not `setup`: the ambient frame has to enclose the body, and only
 * `around` does. Its `finally` running at the call boundary rather than at test
 * settlement costs nothing here — there is no teardown, and the
 * `AsyncLocalStorage` carrier keeps the frame alive across the body's `await`s
 * regardless of when `wrap` returns. On the synchronous carrier an async body
 * still raises `SynchronousStackError` from `wrap`. Declaring no `setup` also
 * keeps `@ghostry/harness` on its uninstrumented path, where a synchronous
 * assertion failure is reported at the user's own line.
 *
 * `provides.fabricator` hands back the scope `wrap` gave its block, not the
 * base instance, so `context.fabricator.salt` is the per-test salt and
 * `.fork()` forks from the test's configuration. The two calls meet through
 * `scope`: set just before `body()`, read by the provider, restored in a
 * `finally`. That is safe under `.concurrent` because `@ghostry/harness` runs a
 * provider synchronously inside its own integration's `around` — no other test
 * can enter between the write and the read, and the context object already
 * holds the scope by the body's first `await`. Restoring rather than clearing
 * keeps a nested `around` from dropping its parent's scope. A provider reached
 * with no scope is a composer breaking that contract, and raises
 * `HarnessingProviderError` rather than quietly providing the base instance.
 *
 * Nothing here reads `instance.context`. The integration is a pure function of
 * the `Identity` it is handed and the instance it decorates: it never resolves
 * an attribution root, never captures a stack, and never sets `clock`. A pinned
 * `Date` (the recommended setup) and the wall-clock default are already
 * concrete numbers by the time `overlay()` sees them, so they inherit through
 * every `wrap` unchanged: salt varies per test, "now" does not. `clock:
 * "derived"` is left alone on purpose — that policy's documented meaning is
 * that the salt _is_ the reproducibility unit, so per-test clocks are the
 * request honored, not a bug to override.
 */
export function integration<$Registry extends PlainObject>(
  instance: Instance<$Registry>,
): Integration<FabricatorTestContext<$Registry>> {
  let scope: Instance<$Registry> | undefined;

  return {
    name: "@ghostry/fabricator",
    provides: {
      fabricator: () => {
        if (typeof scope === "undefined") {
          throw new FabricatorError.HarnessingProviderError();
        }
        return scope;
      },
    },
    around<$Return>(identity: Identity, body: () => $Return): $Return {
      const salt = layer(saltFor(identity));
      return instance.wrap({ salt }, (entered) => {
        const previous = scope;
        scope = entered;
        try {
          return body();
        } finally {
          scope = previous;
        }
      });
    },
  };
}
