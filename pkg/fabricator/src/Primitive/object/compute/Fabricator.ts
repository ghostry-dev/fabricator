import type { Adaptations } from "../../../Adapter/Types";
import { FabricatorError } from "../../../Error";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../../Fabricator/Types";
import type { Trace } from "../../../Random/Types";
import { violatesKind } from "../../../Schema/Core";
import { Kind, Meta, type Adaptation } from "../../../Types";
import { type PlainObject } from "../../../Utility/Types";
import type { Schema } from "./Schema";
import type { Resolved, Source, Meta as ThisMeta } from "./Types";

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
  [Meta]: ThisMeta<$Fabricated, $Source>;
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
 *
 * The parent hands over everything it has fabricated so far; a `narrowed` field
 * (`.from([...])`) passes its resolver only its `dependencies`, and only those
 * present, so an omitted dependency stays absent rather than becoming
 * `undefined`. Narrowing here keeps `object/Fabricator.ts` unaware of it.
 */
export function Fabricator<
  $Fabricated extends PlainObject,
  $Source extends Source,
>(
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

      const meta = schema[Meta];

      const fabricated = meta.narrowed
        ? narrow(params.fabricated, meta.dependencies)
        : params.fabricated;

      const resolved = meta.resolve({ fabricated });

      const sourceKind = meta.source[Kind];
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

function narrow<$Fabricated extends PlainObject>(
  fabricated: $Fabricated,
  dependencies: ReadonlyArray<string>,
): $Fabricated {
  const narrowed: PlainObject = {};
  for (const key of dependencies) {
    if (key in fabricated) narrowed[key] = fabricated[key];
  }
  return narrowed as $Fabricated;
}
