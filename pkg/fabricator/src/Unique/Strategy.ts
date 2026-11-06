import {
  bigintPermutation,
  isDrawable,
  permutation,
  withoutReplacement,
  type Range,
} from "../Distribution";
import { FabricatorError } from "../Error";
import type { Exhaustion } from "../Fabricator/Types";
import type { Stream } from "../Random/Types";
import { Claim } from "../Types";
import { toKeyer, type Keyer } from "./Key";

/**
 * One run of distinct draws: nothing `draw` returns repeats anything it, or
 * `claim`, saw before in the same scope. A `T.unique.*` leaf opens one scope
 * for its built Fabricator's lifetime; a unique collection opens a fresh one
 * per `fabricate()` call.
 */
export type Scope = {
  draw: () => unknown;

  /**
   * Record `value` as produced without drawing it — an override value
   * (`Unique/Override.ts`). Recording only: claiming a value already produced,
   * or one outside the domain, changes nothing.
   */
  claim: (value: unknown) => void;
};

/**
 * How a schema's distinct values are drawn. `capacity` is how many there are,
 * when that is known, which is what lets a collection reject an impossible size
 * at construction rather than on a salt-dependent draw.
 */
export type Strategy = {
  readonly capacity: bigint | undefined;
  open: () => Scope;
};

/**
 * The default number of redraws a tracked scope allows per value — draws after
 * the first that repeat a value already produced — given how many distinct
 * values it has produced: `max(FLOOR, FACTOR × produced)`.
 *
 * Each draw in a scope over `N` equally likely values with `k` produced repeats
 * with probability `k / N`, so a value is forfeited wrongly with probability
 * `(k / N)^(redraws + 1)`. With `20k` redraws, the worst point — the very last
 * value, `k = N - 1` — gives about `(1 - 1/N)^(20(N - 1)) ≈ e^-20 ≈ 2e-9`
 * whatever `N` is, so a uniform domain fills completely in practice. A value
 * that is found costs `1 / (1 - k/N)` draws on average under any limit; the
 * limit only bounds a search that was going to fail, which then reports after
 * about twenty times as many redraws as values produced. `FLOOR` covers a scope
 * that has produced little: there `k / N` is high only when `N` is tiny, and
 * `(5/6)^100` is already about `1e-8`.
 *
 * A skewed distribution's rarest values need more redraws than this, which is
 * what a collection's `redraws` is for: it replaces the formula outright.
 */
const FLOOR = 100;
const FACTOR = 20;

export function defaultRedraws(produced: number): number {
  return Math.max(FLOOR, FACTOR * produced);
}

/**
 * The `redraws` every `T.unique.*` builder's `.whereby` accepts: how many times
 * in a row a tracked draw may repeat a value already produced while looking for
 * a new one, before it forfeits — per value, not across the scope. `0` means
 * one draw and no retries. Replaces the default formula
 * ({@link defaultRedraws}); a skewed distribution is what needs it most, since
 * its rarest values take many draws to find. Validated by {@link toRedraws},
 * and stored on each kind's `Whereby` as a plain `redraws` field.
 */
export type Redraws = { redraws?: number | undefined };

/**
 * Validate a caller-supplied `redraws`. It counts retries, so any whole number
 * from `0` up can be one.
 */
export function toRedraws(
  label: string,
  redraws: number | undefined,
): number | undefined {
  if (redraws === undefined) return undefined;
  if (Number.isSafeInteger(redraws) && redraws >= 0) return redraws;
  throw new FabricatorError.InvalidRedrawsError(label, redraws);
}

/**
 * Sampling without replacement from a weighted list of values — `enum`,
 * `boolean`, and the single-value kinds. Equal values (by {@link toKeyer}) are
 * merged first, their weights summed, so `capacity` counts distinct values and
 * `T.enum.uniform(["a", "a", "b"])` still draws `"a"` two times in three. Draws
 * come from `stream`, the owning node's own.
 */
export function exactValues(
  kind: string,
  entries: ReadonlyArray<readonly [number, unknown]>,
  stream: Stream,
): Strategy {
  const keyer = toKeyer();
  const merged = new Map<number, [number, { key: number; value: unknown }]>();

  for (const [weight, value] of entries) {
    if (!isDrawable(weight)) continue;
    const key = keyer(value);
    const known = merged.get(key);
    if (known) known[0] += weight;
    else merged.set(key, [weight, { key, value }]);
  }

  const values = [...merged.values()];
  const capacity = BigInt(values.length);

  return {
    capacity,
    open: () => {
      const pool = withoutReplacement(values, stream);

      return {
        draw: () => {
          if (pool.remaining === 0) {
            throw new FabricatorError.UniqueExhaustedError(kind, capacity);
          }
          return pool.draw().value;
        },
        claim: (value) => {
          const key = keyer(value);
          pool.discard((entry) => entry.key === key);
        },
      };
    },
  };
}

/**
 * Sampling without replacement from a uniform integer range, by sparse
 * Fisher–Yates (`Distribution/index.ts`'s `permutation`). A claimed value is
 * held aside and skipped when the permutation reaches it — consumed, not
 * redrawn into — which leaves every later draw uniform over what remains.
 * Precondition: the range's size is at most `Number.MAX_SAFE_INTEGER`.
 */
export function exactRange(
  kind: string,
  range: Range,
  stream: Stream,
): Strategy {
  const capacity = BigInt(range.max - range.min + 1);

  return {
    capacity,
    open: () => {
      const order = permutation(range, stream);
      const claimed = new Set<number>();

      return {
        draw: () => {
          while (order.remaining > 0) {
            const value = order.next();
            if (!claimed.delete(value)) return value;
          }
          throw new FabricatorError.UniqueExhaustedError(kind, capacity);
        },
        claim: (value) => {
          if (
            typeof value === "number"
            && Number.isInteger(value)
            && value >= range.min
            && value <= range.max
          ) {
            claimed.add(value);
          }
        },
      };
    },
  };
}

/**
 * {@link exactRange} over a bigint range — no size precondition.
 */
export function exactBigintRange(
  kind: string,
  range: { min: bigint; max: bigint },
  stream: Stream,
): Strategy {
  const capacity = range.max - range.min + BigInt(1);

  return {
    capacity,
    open: () => {
      const order = bigintPermutation(range, stream);
      const claimed = new Set<bigint>();

      return {
        draw: () => {
          while (order.remaining > BigInt(0)) {
            const value = order.next();
            if (!claimed.delete(value)) return value;
          }
          throw new FabricatorError.UniqueExhaustedError(kind, capacity);
        },
        claim: (value) => {
          if (
            typeof value === "bigint"
            && value >= range.min
            && value <= range.max
          ) {
            claimed.add(value);
          }
        },
      };
    },
  };
}

/**
 * Rejection sampling: draw, and draw again while the key has been seen. For
 * every domain no exact strategy covers — strings, dates, composites,
 * `.as(...)`, a skewed or unbounded integer range, a `by` projection.
 *
 * `key` reduces a value to what is stored: a number for a numeric domain (`Set`
 * compares those by SameValueZero already), a {@link Keyer} hash otherwise. When
 * `capacity` is known the scope counts rather than searches — exhausted the
 * moment it has seen that many, with no retries. `admits` keeps a claimed value
 * from outside the domain out of that count: an override of `0` on a `[1, 10]`
 * field must not use up one of its ten.
 */
export function tracked(options: {
  label: string;
  kind: string;
  draw: () => unknown;
  key: (value: unknown) => unknown;
  capacity?: bigint | undefined;
  admits?: ((value: unknown) => boolean) | undefined;
  redraws?: number | undefined;
}): Strategy {
  const { label, kind, draw, key, capacity, admits, redraws } = options;

  return {
    capacity,
    open: () => {
      const seen = new Set<unknown>();

      return {
        draw: () => {
          if (capacity !== undefined && BigInt(seen.size) >= capacity) {
            throw new FabricatorError.UniqueExhaustedError(kind, capacity);
          }

          const limit = redraws ?? defaultRedraws(seen.size);
          for (let redraw = 0; redraw <= limit; redraw++) {
            const value = draw();
            const k = key(value);
            if (!seen.has(k)) {
              seen.add(k);
              return value;
            }
          }

          throw new FabricatorError.UniqueRedrawsError(label, limit, seen.size);
        },
        claim: (value) => {
          if (admits && !admits(value)) return;
          seen.add(key(value));
        },
      };
    },
  };
}

/**
 * {@link tracked} keyed by a fresh {@link Keyer}, through `by` when given.
 */
export function trackedByKey(options: {
  label: string;
  kind: string;
  draw: () => unknown;
  by?: ((value: any) => unknown) | undefined;
  redraws?: number | undefined;
}): Strategy {
  const { by, ...rest } = options;
  const keyer: Keyer = toKeyer();

  return tracked({ ...rest, key: by ? (value) => keyer(by(value)) : keyer });
}

/**
 * `member.fabricate`, for a plain `T.array`/`T.record` whose element or key is
 * a `T.unique.*` leaf (one carrying `[Claim]`): an exhaustion it raises is
 * re-raised naming the collection, whose message points at the per-value
 * builder. Any other member is returned untouched, so the common path pays
 * nothing.
 */
export function withinCollection<$T>(
  collection: FabricatorError.UniqueWithin,
  member: { fabricate: () => $T },
): () => $T {
  const fabricate = () => member.fabricate();
  if (!(Claim in member)) return fabricate;

  return () => {
    try {
      return fabricate();
    } catch (error) {
      throw toWithin(error, collection);
    }
  };
}

function toWithin(
  error: unknown,
  collection: FabricatorError.UniqueWithin,
): unknown {
  if (error instanceof FabricatorError.UniqueExhaustedError) {
    return new FabricatorError.UniqueExhaustedError(
      error.kind,
      error.capacity,
      collection,
    );
  }
  if (error instanceof FabricatorError.UniqueRedrawsError) {
    return new FabricatorError.UniqueRedrawsError(
      error.label,
      error.redraws,
      error.produced,
      collection,
    );
  }
  return error;
}

/**
 * The scope a `T.unique.*` leaf keeps for its built Fabricator's whole life,
 * under the build's exhaustion policy. Under `"cycle"` (an enumeration build —
 * `Fabricator/Types.ts`'s `Exhaustion`), running out opens a fresh scope and
 * draws again, as if nothing had been produced; claims go to whichever scope is
 * current. Both exhaustion errors reset: a tracked leaf of unknown size knows
 * it ran out only by hitting its cap.
 */
export function toLifetimeScope(
  strategy: Strategy,
  exhaustion: Exhaustion,
): Scope {
  if (exhaustion === "throw") return strategy.open();

  let scope = strategy.open();

  return {
    draw: () => {
      try {
        return scope.draw();
      } catch (error) {
        if (!isExhaustion(error)) throw error;
        scope = strategy.open();
        return scope.draw();
      }
    },
    claim: (value) => scope.claim(value),
  };
}

function isExhaustion(error: unknown): boolean {
  return (
    error instanceof FabricatorError.UniqueExhaustedError
    || error instanceof FabricatorError.UniqueRedrawsError
  );
}
