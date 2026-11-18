import type { AdaptationsOf } from "../../Adapter/Types.ts";
import { weighted } from "../../Distribution/index.ts";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../Fabricator/Types.ts";
import type { Trace } from "../../Random/Types.ts";
import { toStreamFromTrace } from "../../Random/index.ts";
import { Children, Kind, Meta, type Adaptation } from "../../Types.ts";
import { never } from "../../Utility/Core.ts";
import { Schema } from "./Schema.ts";
import type {
  Definition,
  Fabricated,
  Outcome,
  Meta as ThisMeta,
} from "./Types.ts";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema>
    ? Fabricated<$Schema[typeof Meta]["definition"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = {
  [Kind]: "undefinable";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: BaseFabricator<any>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["definition"], AdaptationsOf<$Schema>>;
  fabricate: () => Fabricated<$Schema[typeof Meta]["definition"]>;
};

/**
 * A presence roll on this field's private stream, drawn only when the wrapped
 * value is needed — an `undefined` roll never advances `source`'s stream, and
 * since `source` is already dispatched into its own independent stream by
 * `Constructor.ts` regardless of this roll, skipping its draw here can never
 * perturb any other field's reproducibility (see
 * `object/omittable/Fabricator.ts`, and AGENTS.md's "Randomness"). 50/50 by
 * default; `.weighted(...)` (`Schema.ts`) reweights either outcome relative to
 * that same default of `1`.
 */
export function Fabricator<$Definition extends Definition>(
  context: FabricatorContext<Schema<$Definition>>,
  source: BaseFabricator<any>,
): Fabricator<Schema<$Definition>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "undefinable",
      [Meta]: meta,
      trace,
      [Children]: source,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);

  const pick = weighted<Outcome>(
    [
      [meta.weights?.undefined ?? 1, "undefined"],
      [meta.weights?.value ?? 1, "value"],
    ],
    stream,
    "T.undefinable",
  );

  const fabricate = () => {
    const picked = pick();
    switch (picked) {
      case "value":
        return source.fabricate();
      case "undefined":
        return undefined;
      default:
        return never(picked);
    }
  };

  return {
    [Kind]: "undefinable",
    [Meta]: meta,
    trace,
    [Children]: source,
    fabricate,
    schema: rehydrated,
  };
}
