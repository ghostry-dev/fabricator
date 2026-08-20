import type { AnySchema } from "../../Schema/Types";
import { toSchema } from "../../Schema/Core";
import { Kind, Meta } from "../../Types";
import { default as self, type Schema as SelfSchema } from "./self";
import { Schema } from "./Schema";
import { terminate } from "./Terminate";
import type { Whereby } from "./Types";

/**
 * `T.recursive(body)` — a builder, not a Schema, matching `array`/`record`:
 * `.whereby({ depth })` is what produces one; no bare form. `terminal` is
 * optional: omitted, it is derived from `body` (`Terminate.ts`).
 *
 * `body` is called exactly once, here, with a single freshly-minted `self`
 * placeholder — eagerly, the same timing `array`/`record` normalize their
 * nested definitions at call time, not deferred to `.whereby()`. Every `self`
 * in the returned schema is this same placeholder; `Constructor.ts`'s `make`
 * matches it only by `[Kind]`, never by identity, so a `self` captured out of
 * its callback and reused elsewhere silently resolves against whichever
 * recursion is currently active rather than erroring — a misuse this library
 * doesn't guard, the same way passing the wrong schema object elsewhere isn't.
 */
export default function <const $Body extends AnySchema>(
  body: (self: SelfSchema) => $Body,
): { whereby(config: Whereby<$Body>): Schema<$Body> } {
  const placeholder = self();
  const resolvedBody = toSchema(body(placeholder)) as $Body;

  return {
    whereby: (config: Whereby<$Body>): Schema<$Body> =>
      Schema({
        [Kind]: "recursive",
        [Meta]: {
          body: resolvedBody,
          depth: config.depth,
          terminal: config.terminal
            ? toSchema(config.terminal)
            : terminate(resolvedBody),
        },
      }),
  };
}
