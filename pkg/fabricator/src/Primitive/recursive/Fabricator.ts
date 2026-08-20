import type { AdaptationsOf } from "../../Adapter/Types";
import type {
  ConstructionContext,
  FabricatorContext,
  NaiveFabricator,
} from "../../Fabricator/Types";
import { toStreamFromTrace } from "../../Random";
import type { RandomSource, Trace } from "../../Random/Types";
import { Kind, Meta, type Adaptation } from "../../Types";
import { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema extends { [Meta]: ThisMeta }>
    ? Fabricated<$Schema[typeof Meta]["body"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta },
> = NaiveFabricator<Fabricated<$Schema[typeof Meta]["body"]>> & {
  [Kind]: "recursive";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["body"], AdaptationsOf<$Schema>>;
};

/**
 * Expansion is lazy — one dispatch per `self` at fabricate time, not unrolled
 * to `depth.max` at build. This is the only place dispatch (assigning a node
 * its private stream) happens _inside_ `fabricate()`, not at `new
 * Fabricator(...)`. Safe because of isolation, not memoization: every other
 * kind's dispatch count is a function of schema shape, so structural path
 * keying already identifies it. A recursive node's count is data-dependent —
 * how deep this `fabricate()` goes — so no structural path distinguishes
 * sibling expansions at the same depth (an `array` of three `self` children
 * calls `fabricateAt` three times on one shared element Fabricator; the schema
 * does not tell them apart). Each expansion gets its own _root_: `forkSource`
 * mints an isolated `RandomSource` seeded from this node's draw, and each
 * `fabricateAt` opens a `"counted"` scope on it (`Random/Types.ts`'s `RootKind`
 * — recorded on each expansion's `trace`, not chosen at `ConstructorOptions`).
 * The private source's construction counter orders expansions; nothing to
 * increment here. Isolation also keeps this node's data-dependent draws from
 * perturbing (or being perturbed by) an unrelated Fabricator from the same
 * `initialize()` instance.
 *
 * Each `self` gets its own independently-dispatched expansion — calling
 * `context.self` twice (two array slots) is two `fabricateAt` calls, each with
 * its own scope and stream space — `tuple`'s per-slot convention, not `array`'s
 * shared-element one. Sibling tree branches therefore draw independently, not a
 * correlated shared sequence.
 */
export function Fabricator<$Body>(
  context: FabricatorContext<Schema<$Body>>,
  forkSource: (seed: string) => RandomSource,
  make: (
    schema: unknown,
    path: ReadonlyArray<string>,
    context: ConstructionContext,
  ) => NaiveFabricator<unknown>,
): Fabricator<Schema<$Body>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];
  const rehydrated = Schema(schema);

  const stream = toStreamFromTrace(algorithm, trace);
  const privateSource = forkSource(stream.seed);

  function fabricateAt(depth: number) {
    const atMax = depth >= meta.depth.max;
    const target = atMax ? meta.terminal : meta.body;

    const construction = privateSource.toRoot("counted");

    const context: ConstructionContext = {
      toTrace: (path, kind) => ({ ...construction, path, kind }),
      /**
       * `privateSource` is a fork of the outer construction's `source` (see
       * this function's doc). `fork` threads `clock` unchanged
       * (`Random/index.ts`), so `construction.clock` is the parent
       * construction's resolved "now" for every lazy expansion, however deep
       * `fabricateAt` recurses — each node's own `trace` carries it.
       */
      algorithm,
      self: atMax ? undefined : () => fabricateAt(depth + 1),
    };

    return make(target, [], context).fabricate() as Fabricated<$Body>;
  }

  return {
    [Kind]: "recursive",
    [Meta]: meta,
    trace,
    fabricate: () => fabricateAt(0),
    schema: rehydrated,
  };
}
