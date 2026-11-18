import { toSchema } from "../../../Schema/Core.ts";
import { Kind, Meta } from "../../../Types.ts";
import { Schema } from "./Schema.ts";
import type { Definition } from "./Types.ts";

export default function <const $Definition extends Definition>(
  definition: $Definition,
): Schema<$Definition> {
  const normalized = toSchema(definition) as $Definition;
  return Schema({
    [Kind]: "object.omittable",
    [Meta]: { definition: normalized },
  });
}
