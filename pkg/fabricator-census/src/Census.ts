import { CensusError } from "./Error";
import { resolveOptions } from "./Options";
import { toContext } from "./Tally/Context";
import { NodeTally } from "./Tally/Node";
import type { Accumulator, Census, CensusOptions } from "./Types";

/**
 * Start an incremental census. Every other way of taking one goes through this:
 * the accumulator never iterates anything itself, so a driver cursor, a stream
 * or several batches in turn all reduce to calling `add`.
 */
function begin(options?: CensusOptions): Accumulator {
  const resolved = resolveOptions(options);
  const context = toContext(
    resolved,
    (context, path, depth) => new NodeTally(context, path, depth),
  );
  const root = context.node([], 0);
  let result: Census | undefined;

  return {
    add(value) {
      if (result !== undefined) throw new CensusError.FinishedError();
      root.add(value);
    },
    finish() {
      return (result ??= { options: resolved, root: root.snapshot() });
    },
  };
}

/** A census of every value in `values`, in one synchronous pass. */
function from(values: Iterable<unknown>, options?: CensusOptions): Census {
  const accumulator = begin(options);
  for (const value of values) accumulator.add(value);
  return accumulator.finish();
}

/**
 * Take a census of real data: `census.from(rows)` over anything iterable, or
 * `census.begin()` to add values one at a time from any source, synchronous or
 * not.
 */
export const census: {
  from(values: Iterable<unknown>, options?: CensusOptions): Census;
  begin(options?: CensusOptions): Accumulator;
} = { from, begin };
