import type { AdaptationsOf } from "../../../Adapter/Types";
import { weighted } from "../../../Distribution";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../../Fabricator/Types";
import type { Trace } from "../../../Random/Types";
import { toStreamFromTrace } from "../../../Random";
import { Children, Kind, Meta, Omitted, type Adaptation } from "../../../Types";
import type { Schema } from "./Schema";
import type { Definition, Outcome, Resolved, Meta as ThisMeta } from "./Types";

export type Fabrication<$Fabricator extends Fabricator<any>> =
  $Fabricator extends Fabricator<infer $Schema>
    ? Resolved<$Schema[typeof Meta]["definition"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = {
  [Kind]: "object.optional";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: BaseFabricator<any>;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  /**
   * `Omitted` on the omission roll (or when an `.as(...)` producer returns it)
   * — read only by `object/Fabricator.ts`'s fabricate loop, which omits the key
   * entirely rather than writing `undefined`. A "present as `undefined`" roll
   * returns `undefined` directly, which the loop assigns like any ordinary
   * value — the difference from `object.omittable`. Fabricating this outside a
   * parent `object` hands whichever of the three results back verbatim.
   */
  fabricate: () => Resolved<$Schema[typeof Meta]["definition"]>;
};

export function isObjectOptionalFabricator(
  candidate: BaseFabricator<unknown>,
): candidate is Fabricator {
  return candidate[Kind] === "object.optional";
}

/**
 * Three-way roll: omitted, present-as-`undefined`, or the wrapped value — on
 * this field's private stream; `source` is drawn only when "value" wins.
 * Uniform (1/3 each) by default; not achievable by composing
 * `object.omittable(T.undefinable(inner))`'s two independent 50/50 rolls (that
 * is 50/25/25, not 33/33/33), hence the dedicated three-way `weighted()` here —
 * see CLAUDE.md's "Why `T.optional` isn't `omittable(undefinable(inner))`"
 * under "Compound / field-only kinds". `.weighted(...)` (`Schema.ts`) reweights
 * individual outcomes relative to that same default of `1`; an unspecified
 * outcome keeps it. Skipping `source`'s draw on the two non-"value" outcomes is
 * safe for the same reason as `object/omittable/Fabricator.ts`: `source`
 * already has its own independent stream, minted at build time regardless of
 * this roll (see CLAUDE.md's "Randomness").
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
      [Kind]: "object.optional",
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
      [meta.weights?.undefined ?? 1, "undefined"],
      [meta.weights?.value ?? 1, "value"],
    ],
    stream,
    "T.optional",
  );

  const fabricate = (): Resolved<$Definition> => {
    const outcome = pick();
    if (outcome === "omitted") return Omitted;
    if (outcome === "undefined") return undefined;
    return source.fabricate();
  };

  return {
    [Kind]: "object.optional",
    [Meta]: meta,
    trace,
    [Children]: source,
    fabricate,
  };
}
