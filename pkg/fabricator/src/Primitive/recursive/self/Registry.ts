import { Kind, Meta } from "../../../Types";
import { Schema } from "./Schema";

/**
 * Mints a fresh `self` placeholder — called only from `recursive/Registry.ts`
 * to hand one to `T.recursive`'s own body callback. Not exposed as `T.self`,
 * the same standing as `object.compute`'s own internal-only factory.
 */
export default function (): Schema {
  return Schema({ [Kind]: "recursive.self", [Meta]: {} });
}
