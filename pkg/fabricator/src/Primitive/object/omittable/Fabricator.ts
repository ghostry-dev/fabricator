import type { AdaptationsOf } from "../../../Adapter/Types";
import { weighted } from "../../../Distribution";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../../Fabricator/Types";
import type { Trace } from "../../../Random/Types";
import { toStreamFromTrace } from "../../../Random";
import { Children, Kind, Meta, Omitted, type Adaptation } from "../../../Types";
import { never } from "../../../Utility/Core";
import type { Schema } from "./Schema";
import type { Definition, Outcome, Resolved, Meta as ThisMeta } from "./Types";

export type Fabrication<$Fabricator extends Fabricator<any>> =
  $Fabricator extends Fabricator<infer $Schema>
    ? Resolved<$Schema[typeof Meta]["definition"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = {
  [Kind]: "object.omittable";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: BaseFabricator<any>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  /**
   * `Omitted` on the empty roll (or when an `.as(...)` producer returns it)
   * — read only by `object/Fabricator.ts`'s fabricate loop, which omits the
   * key entirely rather than writing `undefined`. Fabricating this outside
   * a parent `object` hands the sentinel straight back.
   */
  fabricate: () => Resolved<$Schema[typeof Meta]["definition"]>;
};

export function isObjectOmittableFabricator(
  candidate: BaseFabricator<unknown>,
): candidate is Fabricator {
  return candidate[Kind] === "object.omittable";
}

/**
 * A presence roll on this field's private stream, drawn only when present
 * is decided — an omission roll never advances `source`'s stream, and since
 * `source` is already dispatched into its own independent stream by
 * `Constructor.ts` regardless of this roll, skipping its draw here can
 * never perturb any other field's reproducibility (`Random/index.ts`'s
 * `toStreamFromTrace`: every field's stream is private from the moment it's
 * minted). 50/50 by default; `.weighted(...)` (`Schema.ts`) reweights
 * either outcome relative to that same default of `1`.
 */
export function Fabricator<$Definition extends Definition>(
  context: FabricatorContext<Schema<$Definition>>,
  source: BaseFabricator<any>,
): Fabricator<Schema<$Definition>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "object.omittable",
      [Meta]: meta,
      trace,
      [Children]: source,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);

  const pick = weighted<Outcome>(
    [
      [meta.weights?.omitted ?? 1, "omitted"],
      [meta.weights?.value ?? 1, "value"],
    ],
    stream,
    "T.omittable",
  );

  const fabricate = () => {
    const picked = pick();
    switch (picked) {
      case "value":
        return source.fabricate();
      case "omitted":
        return Omitted;
      default:
        never(picked);
    }
  };

  return {
    [Kind]: "object.omittable",
    [Meta]: meta,
    trace,
    [Children]: source,
    fabricate,
  };
}
