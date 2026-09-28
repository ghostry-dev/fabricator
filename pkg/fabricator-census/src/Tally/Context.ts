import type { Stream } from "@ghostry/fabricator";
import {
  defaultAlgorithm,
  randomSalt,
  toStream,
} from "@ghostry/fabricator/internal";
import type { ResolvedOptions } from "../Types";
import type { NodeTally } from "./Node";

/**
 * A tally's position in the data, one segment per step. Segments are tagged by
 * their first character so no two steps can spell the same path: `.key` an
 * object field, `[]` an array element, `{key}`/`{value}` a record's keys and
 * values, `#…` a derived tally (`#length`, `#epoch`, …) within a node.
 */
export type Path = ReadonlyArray<string>;

/**
 * What every tally in one census shares. `node` is how a composite tally
 * creates the node beneath it: `Node.ts` imports the composites, so a composite
 * importing `NodeTally` as a value would be a module cycle.
 */
export type Context = {
  options: ResolvedOptions;
  node(path: Path, depth: number): NodeTally;
  random(path: Path): Stream;
};

/**
 * Streams come from core's own default algorithm, keyed by `[seed, ...path]`
 * the way core keys a leaf's stream by its structural path: a tally's draws
 * depend on its own position alone, so adding a field elsewhere leaves this
 * one's reservoir unchanged under a fixed seed.
 */
export function toContext(
  options: ResolvedOptions,
  node: (context: Context, path: Path, depth: number) => NodeTally,
): Context {
  const seed = options.seed ?? randomSalt();
  const context: Context = {
    options,
    node: (path, depth) => node(context, path, depth),
    random: (path) =>
      toStream(defaultAlgorithm, JSON.stringify([seed, ...path])),
  };
  return context;
}
