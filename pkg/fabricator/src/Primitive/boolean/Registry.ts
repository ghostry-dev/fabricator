import type { Adaptations } from "../../Adapter/Types";
import { Adaptation, Kind, Meta, Produces } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated } from "./Types";

const registry: Schema<{}, Adaptations> = {
  /**
   * Keep `[Produces]` and `[Adaptation]` assigned here — see CLAUDE.md's
   * "declaration-emit trap." Both are optional and symbol-keyed, so this
   * top-level spread is the one place declaration emit needs them actually
   * written to have a name to print.
   */
  ...Schema({
    [Kind]: "boolean",
    [Meta]: {},
    [Produces]: undefined as unknown as Fabricated,
    [Adaptation]: undefined as unknown as Adaptations,
  }),
};

export default registry;
