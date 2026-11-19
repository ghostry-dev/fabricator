import type { Adaptations } from "../../../Adapter/Types.ts";
import { FabricatorError } from "../../../Error/index.ts";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../../Fabricator/Types.ts";
import type { Trace } from "../../../Random/Types.ts";
import { violatesKind } from "../../../Schema/Core.ts";
import { Kind, Meta, type Adaptation } from "../../../Types.ts";
import { type PlainObject } from "../../../Utility/Types.ts";
import type { Schema } from "./Schema.ts";
import type { Resolved, Source, Meta as ThisMeta } from "./Types.ts";

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
 * comes entirely from `resolve`, given the fields it reads. Only an `object`'s
 * stage entries are built this way (`Constructor.ts`'s `buildField`); anywhere
 * else is `DetachedComputeError` at build time, and so is `.fabricate()`
 * without the fields.
 *
 * `object/Fabricator.ts` hands over exactly `[Meta].dependencies`, each at the
 * version this field reads, so nothing is narrowed here.
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
      const resolved = meta.resolve({ fabricated: params.fabricated });

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
