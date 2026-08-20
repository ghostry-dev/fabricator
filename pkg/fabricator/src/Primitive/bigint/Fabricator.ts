import type { AdaptationsOf } from "../../Adapter/Types";
import { effectiveDiscreteBigint } from "../../Bound";
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
  [Kind]: "bigint";
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
      [Kind]: "bigint",
      [Meta]: meta,
      trace,
      fabricate: () => produce({ random: stream, clock: trace.clock }),
      schema: rehydrated,
    };
  }

  const stream = toStreamFromTrace(algorithm, trace);
  const { min, max } = effectiveDiscreteBigint(
    meta.whereby.min,
    meta.whereby.max,
  );
  const range = max - min + BigInt(1);

  const byteBits = 8;
  const bitWidth = range.toString(2).length;
  const byteWidth = Math.ceil(bitWidth / byteBits);
  const bitMask = (BigInt(1) << BigInt(bitWidth)) - BigInt(1);

  const fabricate = (): bigint => {
    const buffer = new Uint8Array(byteWidth);

    const readBufferAsBigInt = (): bigint => {
      let value = BigInt(0);
      for (const byte of buffer) {
        value = (value << BigInt(byteBits)) | BigInt(byte);
      }
      return value;
    };

    /**
     * Fill the buffer one byte at a time from the seeded source — the top 8
     * bits of each draw — so bigint generation is reproducible under a seed
     * like every other primitive, rather than drawing unseedable bytes from
     * `crypto.getRandomValues`.
     */
    const sample = (): bigint => {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(stream.next() * 256);
      }
      return readBufferAsBigInt() & bitMask;
    };

    /**
     * Rejection sampling: draw bitWidth random bits and retry any draw that
     * overshoots range. Avoids the modulo bias you'd get from `random %
     * range`.
     *
     * Loop expectation is <2 iterations because the mask keeps it within one
     * bit of the range.
     */
    while (true) {
      const candidate = sample();
      if (candidate < range) return min + candidate;
    }
  };

  return {
    [Kind]: "bigint",
    [Meta]: meta,
    trace,
    fabricate,
    schema: rehydrated,
  };
}
