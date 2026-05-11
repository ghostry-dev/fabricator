import { withAdaptations, type AdaptationEntry } from "../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../Adapter/Types";
import { Kind } from "../../Types";
import type { Core } from "./Types";

/**
 * A recursive schema, produced by `.whereby({ depth })` — see
 * `Registry.ts` for the builder `T.recursive(body)` itself returns.
 * `terminal` is optional there; omitted, it is derived from `body`.
 *
 * No `.as()`, unlike `array`/`record`: a fully custom whole-value producer
 * would need to be reproducible per depth on its own terms, which is
 * exactly the problem `depth`/`terminal` already solve — deferred rather
 * than ruled out, since adding it later is non-breaking.
 */
export interface Schema<
  $Body = unknown,
  $Adaptations extends Adaptations = {},
> extends Core<$Body, $Adaptations> {
  /**
   * Override what this schema maps to in one or more external schema
   * libraries — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$Body, $Adaptations>>) => $Returnable,
  ) => Schema<
    $Body,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<$Body, $Adaptations extends Adaptations = {}>(
  schema: Core<$Body, $Adaptations>,
): Schema<$Body, $Adaptations> {
  return {
    ...schema,
    [Kind]: "recursive",
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
