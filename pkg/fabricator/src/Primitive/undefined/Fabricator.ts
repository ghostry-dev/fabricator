import type { AdaptationsOf } from "../../Adapter/Types.ts";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types.ts";
import type { Trace } from "../../Random/Types.ts";
import { Kind, Meta, type Adaptation } from "../../Types.ts";
import { Schema } from "./Schema.ts";
import type { Fabricated, Meta as ThisMeta } from "./Types.ts";

export type Fabrication<_ extends Fabricator> = Fabricated;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated> & {
  [Kind]: "undefined";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<AdaptationsOf<$Schema>>;
};

export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, trace } = context;
  const rehydrated = Schema({ ...schema });
  return {
    [Kind]: "undefined",
    [Meta]: schema[Meta],
    trace,
    fabricate: () => undefined,
    schema: rehydrated,
  };
}
