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
 * Escape hatch for values no kind models — a `Map`, a `Set`, a `URL`, a
 * class instance, a branded type. `produce` is supplied at construction and
 * receives the schema's own seeded stream (`Types.ts`'s `Produce`).
 *
 * No `.as()`, for `always`'s reason: the constructor argument already fully
 * determines production. `adapt` matters more here than for any other kind
 * — an opaque value maps to TypeBox's `Unknown`, which is honest but
 * maximally imprecise, and `.adapt(typebox, ...)` is the only way to say
 * more.
 */
export interface Schema<
  $T = unknown,
  $Adaptations extends Adaptations = {},
> extends Core<$T, $Adaptations> {
  /**
   * Override what this schema maps to in one or more external schema
   * libraries — see `string/Schema.ts`'s `adapt` for the full contract.
   */
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$T, $Adaptations>>) => $Returnable,
  ) => Schema<
    $T,
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<$T, $Adaptations extends Adaptations = {}>(
  schema: Core<$T, $Adaptations>,
): Schema<$T, $Adaptations> {
  return {
    ...schema,
    [Kind]: "opaque",
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
