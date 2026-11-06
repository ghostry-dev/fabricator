import type { AdaptationsOf } from "../../Adapter/Types";
import { weighted } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Claim, Kind, Meta, type Adaptation } from "../../Types";
import { exactValues, toLifetimeScope } from "../../Unique/Strategy";
import { Schema } from "./Schema";
import type { Fabricated, Items, Meta as ThisMeta } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema>
    ? Fabricated<$Schema[typeof Meta]["items"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated<$Schema[typeof Meta]["items"]>> & {
  [Kind]: "enum";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  /** Present on a `T.unique.enum` only — see `Types.ts`'s `Claim`. */
  readonly [Claim]?: (value: unknown) => void;
  schema: Schema<$Schema[typeof Meta]["items"], AdaptationsOf<$Schema>>;
};

export function Fabricator<$Items extends Items>(
  context: FabricatorContext<Schema<$Items>>,
): Fabricator<Schema<$Items>> {
  const { schema, algorithm, trace, exhaustion } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "enum",
      [Meta]: meta,
      trace,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);

  if (meta.unique) {
    const scope = toLifetimeScope(
      exactValues("enum", meta.items, stream),
      exhaustion,
    );

    return {
      [Kind]: "enum",
      [Meta]: meta,
      trace,
      fabricate: () => scope.draw() as Fabricated<$Items>,
      [Claim]: scope.claim,
      schema: rehydrated,
    };
  }

  const pick = weighted<Fabricated<$Items>>(meta.items, stream, "T.enum");

  return {
    [Kind]: "enum",
    [Meta]: meta,
    trace,
    fabricate: pick,
    schema: rehydrated,
  };
}
