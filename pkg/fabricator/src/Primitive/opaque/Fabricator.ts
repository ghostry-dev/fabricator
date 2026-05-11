import type { AdaptationsOf } from "../../Adapter/Types";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Kind, Meta, type Adaptation } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema>
    ? $Schema[typeof Meta] extends ThisMeta<infer $T>
      ? Fabricated<$T>
      : never
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta<any> } = { [Meta]: ThisMeta },
> = NaiveFabricator<
  $Schema[typeof Meta] extends ThisMeta<infer $T> ? Fabricated<$T> : never
> & {
  [Kind]: "opaque";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: $Schema[typeof Meta] extends ThisMeta<infer $T>
    ? Schema<$T, AdaptationsOf<$Schema>>
    : never;
};

export function Fabricator<$T>(
  context: FabricatorContext<Schema<$T>>,
): Fabricator<Schema<$T>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];

  /**
   * The one kind that does *not* short-circuit on `produce` before obtaining
   * a stream — for every other kind `produce` means "no randomness needed,"
   * whereas here the stream is precisely what `produce` is called with. So
 * this always draws its stream and always records `trace`, the inverse
 * of `always` (a fixed value, which never draws). Don't collapse the
 * `toStreamFromTrace` call: the branch structure is what every other
 * kind's own conditional stream minting mirrors.
   */
  const stream = toStreamFromTrace(algorithm, trace);

  return {
    [Kind]: "opaque",
    [Meta]: meta,
    trace,
    fabricate: () => meta.produce({ random: stream, clock: trace.clock }),
    schema: Schema(schema),
  };
}
