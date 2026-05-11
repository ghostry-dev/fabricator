import type { AdaptationsOf } from "../../Adapter/Types";
import { weighted } from "../../Distribution";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Children, Kind, Meta, type Adaptation } from "../../Types";
import { never } from "../../Utility/Core";
import { Schema } from "./Schema";
import type {
  Definition,
  Fabricated,
  Outcome,
  Meta as ThisMeta,
} from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema>
    ? Fabricated<$Schema[typeof Meta]["definition"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = {
  [Kind]: "nullish";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: BaseFabricator<any>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["definition"], AdaptationsOf<$Schema>>;
  fabricate: () => Fabricated<$Schema[typeof Meta]["definition"]>;
};

/**
 * Three-way roll: `null`, `undefined`, or the wrapped value — on this
 * field's private stream; `source` is drawn only when "value" wins. Uniform
 * (1/3 each) by default; not achievable by composing
 * `nullable(T.undefinable(inner))`'s two independent 50/50 rolls (that is
 * 50/25/25, not 33/33/33), hence the dedicated three-way `weighted()` here
 * — see `object/optional/Fabricator.ts` and CLAUDE.md's "Why `T.optional`
 * isn't `omittable(undefinable(inner))`". `.weighted(...)` (`Schema.ts`)
 * reweights individual outcomes relative to that same default of `1`; an
 * unspecified outcome keeps it. Skipping `source`'s draw on the two
 * non-"value" outcomes is safe for the same reason as
 * `object/omittable/Fabricator.ts`: `source` already has its own
 * independent stream, minted at build time regardless of this roll (see
 * CLAUDE.md's "Randomness").
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
      [Kind]: "nullish",
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
      [meta.weights?.null ?? 1, "null"],
      [meta.weights?.undefined ?? 1, "undefined"],
      [meta.weights?.value ?? 1, "value"],
    ],
    stream,
    "T.nullish",
  );

  const fabricate = (): Fabricated<$Definition> => {
    const picked = pick();
    switch (picked) {
      case "value":
        return source.fabricate();
      case "null":
        return null;
      case "undefined":
        return undefined;
      default:
        return never(picked);
    }
  };

  return {
    [Kind]: "nullish",
    [Meta]: meta,
    trace,
    [Children]: source,
    fabricate,
    schema: rehydrated,
  };
}
