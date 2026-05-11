import { withAdaptations, type AdaptationEntry } from "../../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../../Adapter/Types";
import { Kind } from "../../../Types";
import type { Core } from "./Types";

/**
 * The placeholder `T.recursive`'s body callback receives in place of the
 * schema being defined — everywhere `self` appears, it stands for "recurse
 * one level deeper here." Never constructed directly: `T.recursive` is the
 * only thing that mints one, and only ever hands it to its own callback, so
 * there is no bare `T.self`.
 *
 * No `.as()` — unlike `always`, not because there's nothing left to
 * override, but because there is nothing here *to* produce: a `self` node
 * carries no value of its own, only a reference to whatever the enclosing
 * recursion currently binds it to. `adapt` still applies, on the same
 * footing as every other kind.
 */
export interface Schema<
  $Adaptations extends Adaptations = {},
> extends Core<$Adaptations> {
  adapt: <
    const $Adapter extends Adapter,
    $Returnable extends ReturnType<$Adapter["convert"]>,
  >(
    adapter: $Adapter,
    produce: (adapting: Adapting<Schema<$Adaptations>>) => $Returnable,
  ) => Schema<
    WithAdaptations<$Adaptations, AdaptationEntry<$Adapter, $Returnable>>
  >;
}

export function Schema<$Adaptations extends Adaptations = {}>(
  schema: Core<$Adaptations>,
): Schema<$Adaptations> {
  return {
    ...schema,
    [Kind]: "recursive.self",
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
