import type { AdaptationsOf } from "../../Adapter/Types";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Children, Kind, Meta, type Adaptation } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, Key, Meta as ThisMeta, Value } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema extends { [Meta]: ThisMeta }>
    ? Fabricated<$Schema[typeof Meta]["key"], $Schema[typeof Meta]["value"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<
  Fabricated<$Schema[typeof Meta]["key"], $Schema[typeof Meta]["value"]>
> & {
  [Kind]: "record";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: { key: NaiveFabricator<any>; value: NaiveFabricator<any> };
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<
    $Schema[typeof Meta]["key"],
    $Schema[typeof Meta]["value"],
    AdaptationsOf<$Schema>
  >;
};

export function Fabricator<$Key extends Key, $Value extends Value>(
  context: FabricatorContext<Schema<$Key, $Value>>,
  key: NaiveFabricator<any>,
  value: NaiveFabricator<any>,
): Fabricator<Schema<$Key, $Value>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    return {
      [Kind]: "record",
      [Meta]: meta,
      trace,
      [Children]: { key, value },
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);
  const { max, minTried = 0 } = meta.whereby.size;

  const fabricate = (): Fabricated<$Key, $Value> => {
    /**
     * Uniform and inclusive across `[minTried, max]` — the same formula
     * `string/Fabricator.ts` uses for its length and `array/Fabricator.ts`
     * for its own.
     */
    const size = minTried + Math.floor(stream.next() * (max - minTried + 1));

    const fabricated: Record<PropertyKey, unknown> = {};

    for (let i = 0; i < size; i++) {
      /**
       * Both are drawn every iteration, including when the key turns out to
       * collide, so stream consumption stays in lockstep with the iteration
       * count rather than depending on collision history.
       */
      const k = key.fabricate();
      const v = value.fabricate();

      /**
       * `defineProperty`, never `fabricated[k] = v`. Keys here are drawn, so
       * `"__proto__"` is reachable — and bracket-assigning that key mutates
       * the prototype instead of creating a property. `defineProperty`
       * writes a real enumerable own property and leaves `Object.prototype`
       * intact.
       *
       * Not `object/Fabricator.ts`'s `isPollutionKey` throw: that guard
       * protects developer-written keys, where throwing is actionable. A
       * throw on a *drawn* key would fire on a seed-dependent schedule —
       * the pseudo-flakiness the testing notes warn about. Removing the
       * hazard beats reporting it here.
       *
       * A repeated key overwrites, shrinking the record — see `Types.ts`'s
       * `Whereby` for why that is accepted rather than redrawn.
       */
      Object.defineProperty(fabricated, k, {
        value: v,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return fabricated as Fabricated<$Key, $Value>;
  };

  return {
    [Kind]: "record",
    [Meta]: meta,
    trace,
    [Children]: { key, value },
    fabricate,
    schema: rehydrated,
  };
}
