import { FabricatorError } from "../../../Error";
import { Kind, Meta } from "../../../Types";
import type { Definition, Fabricated } from "../Types";
import { Schema, type Computer, type Narrowed } from "./Schema";
import type { Resolved, Source } from "./Types";

/**
 * `base` is the keys of the `.refine()` stage's base definition — what a plain
 * `.as` resolver depends on, and what `.from([...])` may name. Checked at
 * runtime as well as by type, since a cast or a built Fabricator's widened type
 * can reach `.from` with a key the base never had.
 */
function make<$Definition extends Definition>(
  base: ReadonlyArray<string>,
): Computer<$Definition> {
  return <const $Source extends Source>(source: $Source) => {
    type $Fabricated = Fabricated<$Definition>;

    return {
      as: (
        resolve: (params: {
          fabricated: $Fabricated;
        }) => NoInfer<Resolved<$Source>>,
      ): Schema<$Fabricated, $Source> =>
        Schema({
          [Kind]: "object.compute",
          [Meta]: { source, resolve, dependencies: base, narrowed: false },
        }),

      from: <const $Keys extends ReadonlyArray<keyof $Definition & string>>(
        keys: $Keys,
      ) => {
        for (const key of keys) {
          if (!base.includes(key)) {
            throw new FabricatorError.UnknownFieldError(
              key,
              base,
              "compute from",
            );
          }
        }

        type $Narrowed = Narrowed<$Definition, $Keys[number]>;

        return {
          as: (
            resolve: (params: {
              fabricated: $Narrowed;
            }) => NoInfer<Resolved<$Source>>,
          ): Schema<$Narrowed, $Source> =>
            Schema({
              [Kind]: "object.compute",
              [Meta]: { source, resolve, dependencies: keys, narrowed: true },
            }),
        };
      },
    };
  };
}

export default make;
