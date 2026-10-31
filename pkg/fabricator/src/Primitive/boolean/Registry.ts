import type { Adaptations } from "../../Adapter/Types";
import { Adaptation, Kind, Meta, Produces, type Produced } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated } from "./Types";

/**
 * A function, not the Schema itself: `Schema/Registry.ts` installs it as the
 * `T.boolean` getter, so every read is a distinct Schema — see AGENTS.md's
 * "Registry entries are getters."
 */
function registry(): Schema<{}, Adaptations> {
  return {
    /**
     * Keep `[Produces]` and `[Adaptation]` assigned here — see AGENTS.md's
     * "declaration-emit trap." Both are optional and symbol-keyed, so this
     * top-level spread is the one place declaration emit needs them actually
     * written to have a name to print.
     */
    ...Schema({
      [Kind]: "boolean",
      [Meta]: {},
      [Produces]: undefined as unknown as Produced<Fabricated>,
      [Adaptation]: undefined as unknown as Adaptations,
    }),
  };
}

export default registry;
