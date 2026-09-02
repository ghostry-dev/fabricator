import { shuffle } from "../Distribution";
import { FabricatorError } from "../Error";
import { Constructor } from "../Fabricator/Constructor";
import type { Stack } from "../Instance/Types";
import { toStreamFromTrace } from "../Random";
import type { RandomSource, Salt } from "../Random/Types";
import type { AnySchema, ValueOf } from "../Schema/Types";
import { plan, resolve } from "./Plan";
import type { Axis, Enumerable, Limits, Orderer, Resolvable } from "./Types";

/**
 * Typed `combinatorial`/`coverage` boundary, closing over one instance's
 * `source` and its already-validated `limits` — same shape as
 * `Constructor(source, stack)`. No separate `clock`: `source` already carries
 * its resolved clock (`Random/Types.ts`'s `Options.clock`), so `Constructor`'s
 * `toConstructionContext` reads it off whichever root a construction resolves
 * against. `plan`/ `resolve` (`./Plan.ts`) do the untyped recursive work; this
 * is the one precisely-typed layer, mirroring `Constructor.ts`'s `make`/
 * `construct` split.
 *
 * Two derived seeds — one per API — each an independent, deterministic fork off
 * the _effective_ source's salt (`effectiveSource()` below — the active `wrap`
 * frame's, or this instance's `source`; read fresh on every
 * `combinatorial(...)`/`coverage(...)` call, not once when `enumerables()` was
 * built, so the same `combinatorial` reference behaves differently inside an
 * active `wrap`). `new Fabricator(schema, { salt })` (see `Constructor.ts`'s
 * `construct()`) forks a fully isolated `RandomSource` from that salt, so
 * reusing one salt across many builds — different schemas, or the same schema
 * rebuilt per iteration — never lets one build's draws leak into another's.
 *
 * `root: "unattributed"` is passed alongside it, and is not incidental: a salt
 * says nothing about rooting, so without this pin each build would resolve a
 * caller file. These builds happen inside `iterable`'s `rebuild()`, which runs
 * lazily on `[Symbol.iterator]()` — so the "caller" would be whatever code
 * drained the `Iterable`, not the `combinatorial(...)`/`coverage(...)` call
 * site. Pinning the root keeps `resolveCallerFile()` out of that path entirely,
 * leaves the instance's construction counters untouched, and lets the same salt
 * reproduce regardless of which file the enumeration was requested from.
 */
export function enumerables(
  source: RandomSource,
  limits: Limits,
  stack: Stack,
): { combinatorial: Enumerable; coverage: Enumerable } {
  const Fabricator = Constructor(source, stack);

  /**
   * The active `wrap` frame's source when one exists, else this instance's own
   * — read fresh every time it's called, never cached, so a seed derived from
   * it reflects whichever frame is active _right now_.
   */
  function effectiveSource(): RandomSource {
    return stack.current()?.source ?? source;
  }

  /**
   * One already-built Fabricator tree plus its `Axis` as the lazy `Iterable`
   * both APIs return. Shared because iteration itself — walk `0..width-1`,
   * resolve each pin, stop at `done` — is identical between them; only how
   * `built`/`axis` get produced differs (`"product"` vs. `"cycle"`, and whether
   * a limit is checked first).
   *
   * `rebuild` runs fresh every `[Symbol.iterator]()`, not once up front — that
   * is what makes the `Iterable` safe to iterate more than once: a second pass
   * gets a brand-new build (and, for `coverage`, a brand-new permutation
   * stream) instead of continuing from wherever the first pass left off.
   */
  function iterable<$Schema extends AnySchema>(
    rebuild: () => { built: Resolvable; axis: Axis },
  ): Iterable<ValueOf<$Schema>> {
    return {
      [Symbol.iterator](): Iterator<ValueOf<$Schema>> {
        const { built, axis } = rebuild();
        const width = Number(axis.width);
        let index = 0;

        return {
          next: (): IteratorResult<ValueOf<$Schema>> => {
            if (index >= width) {
              return { done: true, value: undefined as never };
            }

            const value = resolve(
              built,
              axis.at(BigInt(index)),
            ) as ValueOf<$Schema>;
            index++;

            return { done: false, value };
          },
        };
      },
    };
  }

  /**
   * A regular function, not `function*` — the whole body up to the `Iterable`
   * it returns runs eagerly, so the limit check below throws at call time,
   * before any instance is produced, rather than on first iteration. A
   * generator's body doesn't run at all until the first `.next()`, which would
   * defeat that.
   */
  function combinatorial<const $Schema extends AnySchema>(
    schema: $Schema,
  ): Iterable<ValueOf<$Schema>> {
    const combinatorialSalt = [...effectiveSource().salt, "combinatorial"];

    /**
     * Only used to read the axis width — building is otherwise free of side
     * effects worth keeping around, and a fresh build is made again inside
     * `iterable`'s `rebuild()` for actual iteration.
     */
    const probe: Axis = plan(
      new Fabricator(schema, {
        salt: combinatorialSalt,
        root: "unattributed",
      }) as Resolvable,
      { strategy: "product" },
    );

    if (probe.width > BigInt(limits.combinatorial)) {
      throw new FabricatorError.CombinatorialLimitExceededError(
        probe.width,
        limits.combinatorial,
      );
    }

    return iterable(() => {
      const built = new Fabricator(schema, {
        salt: combinatorialSalt,
        root: "unattributed",
      }) as Resolvable;

      return { built, axis: plan(built, { strategy: "product" }) };
    });
  }

  /**
   * Unlike `combinatorial`, no eager probe or limit check: `"cycle"`'s width is
   * the widest single axis, which can never exceed the schema as written —
   * there is nothing a limit would protect against (see `Limits`'s doc
   * comment).
   */
  function coverage<const $Schema extends AnySchema>(
    schema: $Schema,
  ): Iterable<ValueOf<$Schema>> {
    const base = effectiveSource();
    const coverageSalt = [...base.salt, "coverage"];

    /**
     * Independent fork purely for `coverage`'s per-axis permutations (see
     * `Orderer`'s doc comment) — kept separate from `coverageSalt` above only
     * for legibility; two builds forked from unrelated salts can never
     * interfere regardless.
     */
    const orderSalt = [...base.salt, "coverage", "order"];

    return iterable(() => {
      const built = new Fabricator(schema, {
        salt: coverageSalt,
        root: "unattributed",
      }) as Resolvable;

      return {
        built,
        axis: plan(built, {
          strategy: "cycle",
          orderer: orderer(base, orderSalt),
        }),
      };
    });
  }

  return { combinatorial, coverage };
}

/**
 * An `Orderer`: forks an isolated `RandomSource` from `salt` once, draws a
 * single private `Stream`, and `shuffle`s a fresh `0..width-1` array
 * (`Distribution/index.ts`) on every call, consuming that same stream further
 * each time. Sequential draws off one stream is what makes the _order in which
 * `plan()` visits nodes_ the only thing that determines which permutation each
 * node gets — deterministic given a fixed schema shape, reproducible given a
 * fixed `salt`.
 */
function orderer(source: RandomSource, salt: Salt): Orderer {
  const forked = source.fork(salt);
  const root = forked.toRoot("unattributed");
  const stream = toStreamFromTrace(forked.algorithm, {
    ...root,
    path: [],
    kind: "order",
  });

  return (width: bigint): ReadonlyArray<bigint> => {
    const identity = Array.from({ length: Number(width) }, (_, i) => BigInt(i));
    return shuffle(identity, stream);
  };
}
