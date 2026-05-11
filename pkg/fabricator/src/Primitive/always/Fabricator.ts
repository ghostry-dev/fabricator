import type { AdaptationsOf } from "../../Adapter/Types";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { Kind, Meta, type Adaptation } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta, Value } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema>
    ? Fabricated<$Schema[typeof Meta]["value"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated<$Schema[typeof Meta]["value"]>> & {
  [Kind]: "always";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["value"], AdaptationsOf<$Schema>>;
};

export function Fabricator<$Value extends Value>(
  context: FabricatorContext<Schema<$Value>>,
): Fabricator<Schema<$Value>> {
  const { schema, trace } = context;
  const { value } = schema[Meta];
  return {
    [Kind]: "always",
    [Meta]: schema[Meta],
    trace,
    fabricate: () => value,
    schema,
  };
}
