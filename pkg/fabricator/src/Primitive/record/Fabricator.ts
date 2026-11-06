import type { AdaptationsOf } from "../../Adapter/Types";
import { effectiveDiscrete } from "../../Bound";
import { discreteSampler } from "../../Distribution";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import { toStreamFromTrace } from "../../Random";
import type { Stream, Trace } from "../../Random/Types";
import { Children, Kind, Meta, type Adaptation } from "../../Types";
import { assertCapacity, toDistinct } from "../../Unique/Distinct";
import { withinCollection } from "../../Unique/Strategy";
import { Schema } from "./Schema";
import type {
  Fabricated,
  Key,
  Meta as ThisMeta,
  UniqueWhereby,
  Value,
  Whereby,
} from "./Types";

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
  key: BaseFabricator<any>,
  value: BaseFabricator<any>,
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
  const fabricate = meta.unique
    ? distinctly(key, value, stream, meta.whereby)
    : collapsing(key, value, stream, meta.whereby);

  return {
    [Kind]: "record",
    [Meta]: meta,
    trace,
    [Children]: { key, value },
    fabricate: fabricate as () => Fabricated<$Key, $Value>,
    schema: rehydrated,
  };
}

/**
 * `T.record`'s draw: `size` attempts, uniform and inclusive across `[minTried,
 * max]` through the same `discreteSampler` `string`/`array` lengths and
 * `number.integer` use. `size` has no `distribution`, so it is always the
 * uniform case. A repeated key overwrites, shrinking the record — see
 * `Types.ts`'s `Whereby` for why that is accepted rather than redrawn.
 */
function collapsing(
  key: BaseFabricator<any>,
  value: BaseFabricator<any>,
  stream: Stream,
  whereby: Whereby,
): () => Record<PropertyKey, unknown> {
  const { max, minTried = 0 } = whereby.size;
  const drawSize = discreteSampler(undefined, { min: minTried, max }, stream);
  const drawKey = withinCollection("record", key);

  return () => {
    const size = drawSize();
    const fabricated: Record<PropertyKey, unknown> = {};

    for (let i = 0; i < size; i++) {
      /**
       * Both are drawn every iteration, including when the key turns out to
       * collide, so stream consumption stays in lockstep with the iteration
       * count rather than depending on collision history.
       */
      const k = drawKey();
      const v = value.fabricate();
      define(fabricated, k, v);
    }

    return fabricated;
  };
}

/**
 * `T.unique.record`'s draw: `size` distinct keys, so the drawn size is the
 * record's size. The key strategy is chosen once, here, so a `size.max` past a
 * finite key set's capacity is rejected at construction; each call opens a
 * fresh scope. An exact key draws from this record's own `stream`, which the
 * size draw shares; values still come from `value`, one per entry.
 */
function distinctly(
  key: BaseFabricator<any>,
  value: BaseFabricator<any>,
  stream: Stream,
  whereby: UniqueWhereby,
): () => Record<PropertyKey, unknown> {
  const size = effectiveDiscrete(whereby.size.min, whereby.size.max);
  const drawSize = discreteSampler(whereby.size.distribution, size, stream);
  const distinct = toDistinct(key, stream, {
    label: "T.unique.record",
    redraws: whereby.redraws,
  });
  assertCapacity("T.unique.record", distinct, size.max);

  return () => {
    const count = drawSize();
    const scope = distinct.open();
    const fabricated: Record<PropertyKey, unknown> = {};

    for (let i = 0; i < count; i++) {
      const k = scope.draw() as PropertyKey;
      const v = value.fabricate();
      define(fabricated, k, v);
    }

    return fabricated;
  };
}

/**
 * `defineProperty`, never `fabricated[k] = v`. Keys here are drawn, so
 * `"__proto__"` is reachable — and bracket-assigning that key mutates the
 * prototype instead of creating a property. `defineProperty` writes a real
 * enumerable own property and leaves `Object.prototype` intact.
 *
 * Not `object/Fabricator.ts`'s `isPollutionKey` throw: that guard protects
 * developer-written keys, where throwing is actionable. A throw on a _drawn_
 * key would fire on a salt-dependent schedule — the pseudo-flakiness the
 * testing notes warn about. Removing the hazard beats reporting it here.
 *
 * @mutates fabricated
 */
function define(
  fabricated: Record<PropertyKey, unknown>,
  k: PropertyKey,
  v: unknown,
): void {
  Object.defineProperty(fabricated, k, {
    value: v,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
