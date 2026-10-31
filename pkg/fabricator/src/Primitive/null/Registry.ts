import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";

/**
 * A function, not the Schema itself: `Schema/Registry.ts` installs it as the
 * `T.null` getter, so every read is a distinct Schema — see AGENTS.md's
 * "Registry entries are getters."
 */
function registry(): Schema {
  return Schema({ [Kind]: "null", [Meta]: {} });
}

export default registry;
