import { withAdaptations, type AdaptationEntry } from "../../../Adapter/Core";
import type {
  Adaptations,
  Adapter,
  Adapting,
  WithAdaptations,
} from "../../../Adapter/Types";
import {
  schemaSatisfies as satisfies,
  type SatisfiesThis,
} from "../../../Schema/Satisfies";
import { Kind } from "../../../Types";
import type { Core, Fabricated } from "./Types";

/**
 * The placeholder `T.recursive`'s body callback receives in place of the schema
 * being defined — everywhere `self` appears, it stands for "recurse one level
 * deeper here." Never constructed directly: `T.recursive` is the only thing
 * that mints one, and only ever hands it to its own callback, so there is no
 * bare `T.self`.
 *
 * No `.as()` — unlike `always`, not because there's nothing left to override,
 * but because there is nothing here _to_ produce: a `self` node carries no
 * value of its own, only a reference to whatever the enclosing recursion
 * currently binds it to. `adapt` still applies, on the same footing as every
 * other kind.
 */
export interface Schema<
  $Adaptations extends Adaptations = {},
> extends Core<$Adaptations> {
  /**
   * Check that this schema's fabricated value type is assignable to `$Target`.
   * Identity at runtime; the target is not carried into later chained calls —
   * see `object/Schema.ts`'s `satisfies`. Outside `ValueOf`'s `$Bindings`,
   * `Fabricated` is `unknown` — a `self` has no value of its own. Put
   * `.satisfies` on the enclosing `T.recursive(...).whereby(...)` to check the
   * tree.
   */
  satisfies<$Target>(
    this: this & SatisfiesThis<Fabricated, $Target>,
  ): Schema<$Adaptations>;

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
    satisfies,
    adapt: (adapter, produce) =>
      Schema(withAdaptations(schema, adapter, produce)),
  };
}
