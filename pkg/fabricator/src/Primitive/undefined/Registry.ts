import { Kind, Meta, Produces } from "../../Types";
import { Schema } from "./Schema";

const registry: Schema = Schema({
  [Kind]: "undefined",
  [Meta]: {},
  [Produces]: undefined,
});

export default registry;
