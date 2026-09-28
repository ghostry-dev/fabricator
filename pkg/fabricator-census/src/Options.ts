import { CensusError } from "./Error";
import type { CensusOptions, ResolvedOptions } from "./Types";

/**
 * The defaults {@link CensusOptions} documents. `reservoir` at 10k covers the
 * DKW sample size for a ±0.02 CDF band at 95% (4612) with room to spare, and
 * `points` at 1001 resolves the empirical CDF to 0.001, well inside that band.
 */
const defaults: Omit<ResolvedOptions, "seed"> = {
  reservoir: 10_000,
  distinct: 256,
  fields: 256,
  depth: 16,
  bins: 20,
  points: 1001,
};

/** Each count-valued option's integer floor. */
const floors: Record<keyof Omit<ResolvedOptions, "seed">, number> = {
  reservoir: 1,
  distinct: 0,
  fields: 0,
  depth: 0,
  bins: 1,
  points: 2,
};

export function resolveOptions(
  options: CensusOptions | undefined,
): ResolvedOptions {
  const resolved: ResolvedOptions = {
    ...defaults,
    seed: options?.seed ?? null,
  };

  for (const key of Object.keys(floors) as Array<keyof typeof floors>) {
    const value = options?.[key];
    if (value === undefined) continue;
    const floor = floors[key];
    if (!Number.isSafeInteger(value) || value < floor)
      throw new CensusError.InvalidOptionError(
        key,
        value,
        `an integer ≥ ${floor}`,
      );
    resolved[key] = value;
  }

  const seed = options?.seed;
  if (seed !== undefined && typeof seed !== "string")
    throw new CensusError.InvalidOptionError("seed", seed, "a string");

  return resolved;
}
