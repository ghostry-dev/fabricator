import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";
import type { Value } from "./Types";

export default function <const $Value extends Value>(
  value: $Value,
): Schema<$Value> {
  return Schema({ [Kind]: "always", [Meta]: { value } });
}
