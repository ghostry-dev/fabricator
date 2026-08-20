import type { Adaptations } from "../../../Adapter/Types";
import { FabricatorError } from "../../../Error";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../../Fabricator/Types";
import type { Trace } from "../../../Random/Types";
import { violatesKind } from "../../../Schema/Core";
import { Kind, Meta, type Adaptation } from "../../../Types";
import type { Schema } from "./Schema";
import type { Resolved, Source } from "./Types";

export type Fabrication<$Fabricator extends Fabricator<any, Source>> =
  $Fabricator extends Fabricator<any, infer $Source>
    ? Resolved<$Source>
    : never;

export type Fabricator<
  $Fabricated,
  $Source extends Source,
  $Adaptations extends Adaptations = {},
> = {
  [Kind]: "object.compute";
  [Meta]: {
    source: $Source;
    resolve: (params: { fabricated: $Fabricated }) => Resolved<$Source>;
  };
  readonly trace: Trace;
  readonly [Adaptation]?: $Adaptations;
  fabricate: (params?: { fabricated: $Fabricated }) => Resolved<$Source>;
};

export function isObjectComputeFabricator(
  candidate: BaseFabricator<unknown>,
): candidate is Fabricator<unknown, Source> {
  return candidate[Kind] === "object.compute";
}

/**
 * Turn an `object.compute` Schema into a live Fabricator. Unlike every other
 * kind, there's nothing of `source` to build here — a computed field's value
 * comes entirely from `resolve`, given the rest of the object. The node still
 * records `trace` so it can be rebuilt from a parent field's captured trace;
 * `.fabricate()` without the parent object throws `DetachedComputeError`.
 */
export function Fabricator<$Fabricated, $Source extends Source>(
  context: FabricatorContext<Schema<$Fabricated, $Source>>,
): Fabricator<$Fabricated, $Source> {
  const { schema, trace } = context;
  return {
    [Kind]: "object.compute",
    [Meta]: schema[Meta],
    trace,
    fabricate: (params) => {
      if (!params) {
        throw new FabricatorError.DetachedComputeError();
      }

      const resolved = schema[Meta].resolve({ fabricated: params.fabricated });

      const sourceKind = schema[Meta].source[Kind];
      if (violatesKind(sourceKind, resolved)) {
        throw new FabricatorError.ComputeResultMismatchError(
          sourceKind,
          resolved,
        );
      }

      return resolved;
    },
  };
}
