import type { Identity, Integration } from "@ghostry/fabricator/harnessing";

/**
 * Stands in for `@ghostry/harness`'s `initialize`: it builds an `Identity` and
 * drives each integration the way the real composer's `enterFrame` does —
 * outside-in, index 0 outermost, each `frame` run to its `yield` first, the
 * yielded wrapper applied around everything inner, every provider run inside
 * that wrapper and handed what it established, and contributions merged into
 * one object given to the body.
 *
 * Never the real `@ghostry/harness`. The two repos have no build-order
 * coupling; this file is the contract's executable specification.
 */

/**
 * The bound `@ghostry/harness` checks an `integrations` array against (its
 * `AnyIntegration`). Not `object`: `keyof object` is `never`, so `provides`
 * would reject every real integration.
 *
 * `any` for the established type, not `unknown`: each integration establishes
 * its own thing, and a list of them is heterogeneous. `unknown` would make
 * every `provides` entry contravariantly incompatible with the value its own
 * frame yields.
 */
export type AnyIntegration = Integration<Record<string, unknown>, any>;

/**
 * `row` is always written so the result satisfies `Identity`'s `number |
 * undefined` rather than an optional property. Nothing resolves a location:
 * `Identity` carries no file, which is what lets the real composer skip stack
 * walking entirely (see `saltFor`, `src/Harnessing/Salt.ts`).
 */
export function toIdentity(
  partial: Omit<Identity, "row"> & { readonly row?: number | undefined },
): Identity {
  return {
    kind: partial.kind,
    path: partial.path,
    name: partial.name,
    row: partial.row,
  };
}

/**
 * The real composition for integrations of the shape this package declares —
 * minus key-collision rejection, minus an absent `frame`, and minus the async
 * generator arm, none of which `Integration` here can express.
 *
 * Teardown is resumed with `next()` on success and `throw()` on failure, which
 * is what makes an author's `try`/`catch` around the `yield` see a failing
 * body. A frame that does not catch lets that same error back out, which is
 * pass-through rather than a teardown fault — checked by identity, so a
 * _different_ error still surfaces.
 */
export function compose<$Context extends object, $Return>(
  integrations: ReadonlyArray<AnyIntegration>,
  identity: Identity,
  body: (context: $Context) => $Return,
): $Return {
  const collected: Record<string, unknown> = {};

  const enter = (index: number): $Return => {
    const current = integrations[index];
    if (typeof current === "undefined") return body(collected as $Context);

    const frame = current.frame({ identity });
    const opened = frame.next();

    const descend = (established: unknown): $Return => {
      for (const key of Object.keys(current.provides)) {
        collected[key] = current.provides[key]!({ identity, established });
      }
      return enter(index + 1);
    };

    /** A frame that never yielded brackets nothing and has no teardown. */
    if (opened.done === true) return descend(undefined);

    const wrapper = opened.value;

    const close = (error: unknown, failed: boolean): void => {
      if (!failed) {
        frame.next();
        return;
      }
      try {
        frame.throw(error);
      } catch (thrown) {
        if (thrown !== error) throw thrown;
      }
    };

    const run = (established: unknown): $Return => {
      let result: $Return;
      try {
        result = descend(established);
      } catch (error) {
        close(error, true);
        throw error;
      }
      close(undefined, false);
      return result;
    };

    return typeof wrapper === "function" ? wrapper(run) : run(undefined);
  };

  return enter(0);
}

export function run<$Context extends object, $Established, $Return>(
  integration: Integration<$Context, $Established>,
  identity: Identity,
  body: (context: $Context) => $Return,
): $Return {
  return compose([integration as AnyIntegration], identity, body);
}
