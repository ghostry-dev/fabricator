import type { Adaptations } from "../../Adapter/Types";
import { Adaptation, Kind, Meta, Produces } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated } from "./Types";

type ThisRegistry = Schema<{}, Adaptations> & {
  keyed: (key: string) => Schema<{ key: string }>;
};

const registry: ThisRegistry = {
  /**
   * Keep `[Produces]` and `[Adaptation]` assigned here — see CLAUDE.md's
   * "declaration-emit trap." Both are optional and symbol-keyed, so this
   * top-level spread is the one place declaration emit needs them actually
   * written to have a name to print.
   */
  ...Schema({
    [Kind]: "symbol",
    [Meta]: {},
    [Produces]: undefined as unknown as Fabricated,
    [Adaptation]: undefined as unknown as Adaptations,
  }),

  keyed: (key: string) => {
    return Schema({ [Kind]: "symbol", [Meta]: { key } });
  },
};

export default registry;
