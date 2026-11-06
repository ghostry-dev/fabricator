import type { AdaptationsOf } from "../../Adapter/Types";
import { effectiveDiscreteBigint } from "../../Bound";
import { bigintSampler } from "../../Distribution";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import { toStreamFromTrace } from "../../Random";
import type { Trace } from "../../Random/Types";
import { Claim, Kind, Meta, type Adaptation } from "../../Types";
import { toBigintStrategy } from "../../Unique/Distinct";
import { toLifetimeScope } from "../../Unique/Strategy";
import { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta } from "./Types";

export type Fabrication<_ extends Fabricator> = Fabricated;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated> & {
  [Kind]: "bigint";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  /** Present on a `T.unique.bigint` only — see `Types.ts`'s `Claim`. */
  readonly [Claim]?: (value: unknown) => void;
  schema: Schema<$Schema[typeof Meta], AdaptationsOf<$Schema>>;
};

export function Fabricator(context: FabricatorContext<Schema>): Fabricator {
  const { schema, algorithm, trace, exhaustion } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "bigint",
      [Meta]: meta,
      trace,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);

  if (meta.unique) {
    const scope = toLifetimeScope(
      toBigintStrategy(meta.whereby, stream),
      exhaustion,
    );

    return {
      [Kind]: "bigint",
      [Meta]: meta,
      trace,
      fabricate: () => scope.draw() as bigint,
      [Claim]: scope.claim,
      schema: rehydrated,
    };
  }

  const fabricate = bigintSampler(
    effectiveDiscreteBigint(meta.whereby.min, meta.whereby.max),
    stream,
  );

  return {
    [Kind]: "bigint",
    [Meta]: meta,
    trace,
    fabricate,
    schema: rehydrated,
  };
}
