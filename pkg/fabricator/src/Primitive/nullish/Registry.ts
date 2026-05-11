import { toSchema } from "../../Schema/Core";
import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";
import type { Definition } from "./Types";

export default function <const $Definition extends Definition>(
  definition: $Definition,
): Schema<$Definition> {
  const normalized = toSchema(definition) as $Definition;
  return Schema({ [Kind]: "nullish", [Meta]: { definition: normalized } });
}
