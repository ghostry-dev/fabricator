import type { AdaptationsOf } from "../../Adapter/Types";
import { weighted } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Kind, Meta, type Adaptation } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta } from "./Types";

export type Fabrication<_ extends Fabricator> = Fabricated;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated> & {
  [Kind]: "boolean";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta], AdaptationsOf<$Schema>>;
};

export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "boolean",
      [Meta]: meta,
      trace,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);

  const pick = weighted<Fabricated>(
    [
      [meta.weights?.true ?? 1, true],
      [meta.weights?.false ?? 1, false],
    ],
    stream,
    "T.boolean",
  );

  return {
    [Kind]: "boolean",
    [Meta]: meta,
    trace,
    fabricate: pick,
    schema: rehydrated,
  };
}
