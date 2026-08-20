import { Kind, Meta, Produces } from "../../Types";
import { Schema } from "./Schema";

const registry: Schema = Schema({
  [Kind]: "null",
  [Meta]: {},
  [Produces]: null,
});

export default registry;
