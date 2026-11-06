import {
  effectiveDiscrete,
  effectiveDiscreteBigint,
  type Bound,
} from "../Bound";
import {
  discreteSampler,
  type Distribution,
  type Range,
} from "../Distribution";
import { FabricatorError } from "../Error";
import type { Fabricator } from "../Fabricator/Types";
import type { Whereby as BigintWhereby } from "../Primitive/bigint/Types";
import { toEpochRange } from "../Primitive/date/Defaults";
import { toStringDomain } from "../Primitive/string/Capacity";
import {
  unboundedContinuous,
  unboundedDiscrete,
} from "../Primitive/number/Defaults";
import type { Meta as NumberMeta } from "../Primitive/number/Types";
import type { Stream } from "../Random/Types";
import { Kind, Meta } from "../Types";
import {
  exactBigintRange,
  exactRange,
  exactValues,
  tracked,
  trackedByKey,
  type Strategy,
} from "./Strategy";

/**
 * How many distinct values a unique `number` can produce: every integer of an
 * integer range, skewed or not, and for a continuous range only the single
 * value of one whose ends meet — any other continuous range is left uncounted.
 * Shared by {@link toNumberStrategy} and `Unique/Capacity.ts`.
 */
export function toNumberCapacity(meta: NumberMeta): bigint | undefined {
  if (meta.integer) {
    return toRangeCapacity(
      effectiveDiscrete(
        meta.whereby?.min ?? unboundedDiscrete.min,
        meta.whereby?.max ?? unboundedDiscrete.max,
      ),
    );
  }

  const min = meta.whereby?.min ?? unboundedContinuous.min;
  const max = meta.whereby?.max ?? unboundedContinuous.max;
  return min.value === max.value ? BigInt(1) : undefined;
}

/**
 * The size of an inclusive integer range, exact past `Number.MAX_SAFE_INTEGER`.
 */
export function toRangeCapacity(range: Range): bigint {
  return BigInt(range.max) - BigInt(range.min) + BigInt(1);
}

/**
 * How a unique `number` draws. A uniform integer range small enough for exact
 * positions is a sparse Fisher–Yates permutation on `stream`. Everything else —
 * an unbounded integer, a skewed integer range, any continuous range — tracks
 * the numbers it has produced, calling `draw` (the kind's ordinary sampler)
 * until it lands on a new one. An integer range keeps its exact size as
 * `capacity` even when tracked, so it exhausts by counting rather than by
 * spinning; a continuous range has one only when its two ends meet.
 *
 * Shared by `number/Fabricator.ts` (a `T.unique.number` leaf, with its own
 * stream and sampler) and {@link toDistinct} (a collection member, with the
 * collection's stream and the member's `fabricate`). A leaf's cap is its own
 * `whereby.redraws`; a member's is the collection's.
 */
export function toNumberStrategy(options: {
  label: string;
  meta: NumberMeta;
  stream: Stream;
  draw: () => number;
  redraws?: number | undefined;
}): Strategy {
  const { label, meta, stream, draw } = options;
  const redraws = options.redraws ?? meta.whereby?.redraws;
  const key = (value: unknown) => value;

  if (meta.integer) {
    const range = effectiveDiscrete(
      meta.whereby?.min ?? unboundedDiscrete.min,
      meta.whereby?.max ?? unboundedDiscrete.max,
    );
    const distribution = meta.whereby?.distribution;
    const uniform =
      distribution === undefined || distribution.kind === "uniform";

    if (uniform && range.max - range.min + 1 <= Number.MAX_SAFE_INTEGER) {
      return exactRange("number", range, stream);
    }

    return tracked({
      label,
      kind: "number",
      draw,
      key,
      redraws,
      capacity: toNumberCapacity(meta),
      admits: (value) =>
        typeof value === "number"
        && Number.isInteger(value)
        && value >= range.min
        && value <= range.max,
    });
  }

  const min: Bound<number> = meta.whereby?.min ?? unboundedContinuous.min;
  const max: Bound<number> = meta.whereby?.max ?? unboundedContinuous.max;

  return tracked({
    label,
    kind: "number",
    draw,
    key,
    redraws,
    capacity: toNumberCapacity(meta),
    admits: (value) =>
      typeof value === "number" && value >= min.value && value <= max.value,
  });
}

/**
 * How a unique `date` draws, over `range` — every whole millisecond a draw can
 * produce (`date/Defaults.ts`'s `toEpochRange`). A uniform range small enough
 * for exact positions is a permutation of those milliseconds, like an integer
 * range. Anything wider or skewed tracks the instants produced, by time value,
 * and its exact size lets it exhaust by counting.
 *
 * Both draw whole milliseconds from `stream` — the tracked path through
 * `discreteSampler`, the integer draw — never through the kind's ordinary
 * continuous sampler. That sampler reaches the upper millisecond only when a
 * draw lands exactly on it, so a count that includes it would leave the last
 * instant all but unreachable and the final draw spinning to the cap.
 */
export function toDateStrategy(options: {
  label: string;
  range: Range;
  distribution: Distribution | undefined;
  stream: Stream;
  redraws?: number | undefined;
}): Strategy {
  const { label, range, distribution, stream, redraws } = options;
  const uniform = distribution === undefined || distribution.kind === "uniform";
  const admits = (value: unknown): value is Date =>
    value instanceof Date
    && value.getTime() >= range.min
    && value.getTime() <= range.max;

  if (uniform && range.max - range.min + 1 <= Number.MAX_SAFE_INTEGER) {
    const exact = exactRange("date", range, stream);

    return {
      capacity: exact.capacity,
      open: () => {
        const scope = exact.open();
        return {
          draw: () => new Date(scope.draw() as number),
          claim: (value) => {
            if (admits(value)) scope.claim(value.getTime());
          },
        };
      },
    };
  }

  const next = discreteSampler(distribution, range, stream);

  return tracked({
    label,
    kind: "date",
    draw: () => new Date(next()),
    key: (value) => (value as Date).getTime(),
    redraws,
    capacity: toRangeCapacity(range),
    admits,
  });
}

/**
 * How a unique `bigint` draws: a bigint sparse Fisher–Yates permutation of its
 * range on `stream`, exact at any width.
 */
export function toBigintStrategy(
  whereby: BigintWhereby,
  stream: Stream,
): Strategy {
  return exactBigintRange(
    "bigint",
    effectiveDiscreteBigint(whereby.min, whereby.max),
    stream,
  );
}

/**
 * How a unique collection (`T.unique.array`'s elements, `T.unique.record`'s
 * keys) draws distinct members from `member`, an already-built Fabricator.
 * Chosen once, at construction, by reading `member`'s `[Kind]`/`[Meta]`; the
 * collection then opens a fresh scope per `fabricate()` call.
 *
 * Exact strategies draw from `stream`, the collection's own, never from the
 * member's — the member's own `fabricate` is simply not called. A `date` member
 * reads its range against its own `trace.clock`. Everything else is tracked by
 * canonical key over `member.fabricate`: any member under a `by` projection or
 * an `.as(...)` producer, and also a member that does not repeat by itself (a
 * `sequence`, a bare `symbol`, a `T.unique.*` leaf). Trusting the last group
 * would save a hash per member, but a unique leaf does repeat once it cycles
 * under `combinatorial`/`coverage` (`Fabricator/Types.ts`'s `Exhaustion`), and
 * a repeat would land inside one value.
 *
 * Reads another kind's `[Meta]`, which AGENTS.md otherwise keeps kind-private —
 * the same exception `Enumeration/Plan.ts` takes, for the same reason: the
 * finite value set a kind draws from is exactly what is needed here.
 */
export function toDistinct(
  member: Fabricator<unknown>,
  stream: Stream,
  options: {
    label: string;
    by?: ((value: any) => unknown) | undefined;
    redraws?: number | undefined;
  },
): Strategy {
  const { label, by, redraws } = options;
  const kind = member[Kind];
  const meta: any = member[Meta];
  const draw = () => member.fabricate();

  if (by || meta?.produce || meta?.unique) {
    return trackedByKey({ label, kind, draw, by, redraws });
  }

  switch (kind) {
    case "always":
      return exactValues(kind, [[1, meta.value]], stream);
    case "null":
      return exactValues(kind, [[1, null]], stream);
    case "undefined":
      return exactValues(kind, [[1, undefined]], stream);
    case "boolean":
      return exactValues(
        kind,
        [
          [meta.weights?.true ?? 1, true],
          [meta.weights?.false ?? 1, false],
        ],
        stream,
      );
    case "enum":
      return exactValues(kind, meta.items, stream);
    case "number":
      if (meta.sequence) return trackedByKey({ label, kind, draw, redraws });
      return toNumberStrategy({
        label,
        meta,
        stream,
        draw: draw as () => number,
        redraws,
      });
    case "bigint":
      return toBigintStrategy(meta.whereby, stream);
    case "date":
      return toDateStrategy({
        label,
        range: toEpochRange(meta, member.trace.clock),
        distribution: meta.whereby?.distribution,
        stream,
        redraws,
      });
    case "string":
      return trackedByKey({
        label,
        kind,
        draw,
        redraws,
        ...toStringDomain(meta.whereby),
      });
    default:
      return trackedByKey({ label, kind, draw, redraws });
  }
}

/**
 * Reject, at construction, a collection that may ask for more distinct members
 * than its member schema has — so an exact member can never run out on a draw
 * whose size depends on the salt. A member of unknown capacity passes; it is
 * left to the tracked scope's cap.
 */
export function assertCapacity(
  label: string,
  strategy: Strategy,
  requested: number,
): void {
  const { capacity } = strategy;
  if (capacity !== undefined && BigInt(requested) > capacity) {
    throw new FabricatorError.UniqueCapacityError(label, capacity, requested);
  }
}
