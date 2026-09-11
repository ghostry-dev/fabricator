import type { Identity, Integration } from "@ghostry/fabricator/harnessing";

/**
 * Stands in for `@ghostry/harness`'s `initialize`: it builds an `Identity` and
 * drives each integration the way the real composer's `enterFrame` does —
 * outside-in, index 0 outermost, `around` opened first, every provider run
 * inside it, contributions merged into one object handed to the body.
 *
 * Never the real `@ghostry/harness`. The two repos have no build-order
 * coupling; this file is the contract's executable specification.
 */

/**
 * The bound `@ghostry/harness` checks an `integrations` array against (its
 * `AnyIntegration`). Not `object`: `keyof object` is `never`, so `provides`
 * would reject every real integration.
 */
export type AnyIntegration = Integration<Record<string, unknown>>;

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
 * minus key-collision rejection, and minus `setup` and an absent `around`,
 * neither of which `Integration` here can express.
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

    return current.around(identity, () => {
      for (const key of Object.keys(current.provides)) {
        collected[key] = current.provides[key]!(identity);
      }
      return enter(index + 1);
    });
  };

  return enter(0);
}

export function run<$Context extends object, $Return>(
  integration: Integration<$Context>,
  identity: Identity,
  body: (context: $Context) => $Return,
): $Return {
  return compose([integration], identity, body);
}
