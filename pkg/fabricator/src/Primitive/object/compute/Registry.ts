import { Kind, Meta } from "../../../Types";
import type { Definition, Fabricated } from "../Types";
import { Schema, type Computer } from "./Schema";
import type { Resolved, Source } from "./Types";

function make<$Definition extends Definition>(): Computer<$Definition> {
  return <const $Source extends Source>(source: $Source) => {
    type $Fabricated = Fabricated<$Definition>;

    return {
      as: (
        resolve: (params: {
          fabricated: $Fabricated;
        }) => NoInfer<Resolved<$Source>>,
      ): Schema<$Fabricated, $Source> =>
        Schema({ [Kind]: "object.compute", [Meta]: { source, resolve } }),
    };
  };
}

export default make;
