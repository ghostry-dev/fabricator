import { Kind, Meta } from "../../Types.ts";
import { Schema } from "./Schema.ts";

/**
 * A function, not the Schema itself: `Schema/Registry.ts` installs it as the
 * `T.undefined` getter, so every read is a distinct Schema — see AGENTS.md's
 * "Registry entries are getters."
 */
function registry(): Schema {
  return Schema({ [Kind]: "undefined", [Meta]: {} });
}

export default registry;
