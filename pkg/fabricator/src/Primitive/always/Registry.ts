import { Kind, Meta } from "../../Types.ts";
import { Schema } from "./Schema.ts";
import type { Value } from "./Types.ts";

export default function <const $Value extends Value>(
  value: $Value,
): Schema<$Value> {
  return Schema({ [Kind]: "always", [Meta]: { value } });
}
