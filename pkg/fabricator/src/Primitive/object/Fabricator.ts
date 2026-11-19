import type { AdaptationsOf } from "../../Adapter/Types.ts";
import { FabricatorError } from "../../Error/index.ts";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../Fabricator/Types.ts";
import { toStreamFromTrace } from "../../Random/index.ts";
import type { Trace } from "../../Random/Types.ts";
import { Children, Kind, Meta, Omitted, type Adaptation } from "../../Types.ts";
import { recordOverride } from "../../Unique/Override.ts";
import { isPollutionKey } from "../../Utility/Core.ts";
import { type PlainObject } from "../../Utility/Types.ts";
import {
  isObjectComputeFabricator,
  type Fabricator as ComputeFabricator,
} from "./compute/Fabricator.ts";
import { isObjectOmittableFabricator } from "./omittable/Fabricator.ts";
import { isObjectOptionalFabricator } from "./optional/Fabricator.ts";
import type { Schema } from "./Schema.ts";
import { stageOf } from "./Stages.ts";
import type {
  Definition,
  Fabricated,
  Override,
  Meta as ThisMeta,
} from "./Types.ts";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Schema>
    ? Fabricated<$Schema[typeof Meta]["definition"]>
    : never;

export type Fabricator<
  $Schema extends { [Meta]: ThisMeta } = { [Meta]: ThisMeta<any> },
> = {
  [Kind]: "object";
  [Meta]: $Schema[typeof Meta];
  readonly trace: Trace;
  [Children]: Fields;
  readonly [Adaptation]?: AdaptationsOf<$Schema>;
  schema: Schema<$Schema[typeof Meta]["definition"], AdaptationsOf<$Schema>>;
  /**
   * `overrides`, if given, skips generation for exactly the fields it names —
   * using this Fabricator's already-derived randomness for everything else,
   * never drawing fresh (see `Fabricator()` below). `config.validate` defaults
   * to `true`, delegated to `schema.override(overrides)`'s existing recursive
   * checks (result unused); `{ validate: false }` skips that — used internally
   * when recursing into an already-validated nested override, also available to
   * a caller who already knows their overrides are valid.
   */
  fabricate: (
    overrides?: Override<$Schema[typeof Meta]["definition"]>,
    config?: { validate?: boolean },
  ) => Fabricated<$Schema[typeof Meta]["definition"]>;
};

export function isObjectFabricator(
  candidate: BaseFabricator<unknown>,
): candidate is Fabricator {
  return candidate[Kind] === "object";
}

export type Fields = Record<string, BaseFabricator<unknown>>;

/**
 * Turn an `object` Schema into a live Fabricator, given every field already
 * built by `Constructor.ts` — which owns recursion into nested Schemas, so
 * `object` never calls `construct()` and there's no import cycle with
 * `Constructor.ts`. Schema-baked `.override()`-marked fields (`[Fixed]` in
 * `Types.ts`) are already resolved into literal-valued entries before they
 * reach here. `fabricate`'s `overrides` (below) is a separate per-call
 * mechanism; the two compose.
 *
 * `schema` is echoed as `.schema` unchanged — callers wanting a
 * `toSchema`-normalized Fabricator (no `extend`/`refine`/`override`) pass that;
 * `Constructor.ts`'s `make` passes `object.rehydrate(...)` so a top-level built
 * Fabricator's `.schema` still composes.
 *
 * `stages` is `[Meta].stages` built (`Stages.ts`), and `fields` is each visible
 * key's current version out of it, which is also `[Children]`, so enumeration
 * never pins a hidden field or an earlier version. Two phases: every ordinary
 * entry first, then the compute entries in stage order. A compute entry only
 * reads earlier stages, so stage order is already dependency order. Each is
 * handed exactly its `dependencies`, each at the version current before its
 * stage, with an absent one left out. Hidden entries and earlier versions are
 * fabricated like any other and never emitted. Per-call `overrides` reach only
 * the visible current versions — `.override()` rejects a hidden key, and `{
 * validate: false }` must not let one through — so a compute field reading an
 * earlier version of an overridden key still reads that version.
 */
export function Fabricator<$Definition extends Definition>(
  context: FabricatorContext<Schema<$Definition>>,
  fields: Fields,
  stages: ReadonlyArray<Fields>,
): Fabricator<Schema<$Definition>> {
  const { schema, algorithm, trace } = context;
  const meta = schema[Meta];

  if (meta.produce) {
    const stream = toStreamFromTrace(algorithm, trace);
    const produce = meta.produce;

    const fabricate = (
      overrides?: Override<$Definition>,
      config?: { validate?: boolean },
    ): Fabricated<$Definition> => {
      const produced = produce({ random: stream, clock: trace.clock });
      if (!overrides) return produced;
      /** Throws on an unknown key or a kind-violating value; result unused. */
      if (config?.validate !== false) schema.override(overrides);

      const result: PlainObject = { ...produced, ...overrides };
      /**
       * `Omitted` forces a key off entirely — the spread above wrote the
       * sentinel itself into `result[k]`, so delete it rather than leave a
       * literal symbol value.
       */
      for (const [k, v] of Object.entries(overrides)) {
        if (v === Omitted) delete result[k];
      }

      return result as Fabricated<$Definition>;
    };

    return {
      [Kind]: "object",
      [Meta]: meta,
      trace,
      [Children]: fields,
      fabricate,
      schema,
    };
  }

  const entries = stages.flatMap((stage, at) =>
    Object.keys(stage).map((key) => {
      const field = stage[key]!;
      return {
        at,
        key,
        field,
        visible: fields[key] === field,
        reads: isObjectComputeFabricator(field)
          ? field[Meta].dependencies.map(
              (dependency) =>
                [dependency, stageOf(stages, dependency, at)] as const,
            )
          : [],
      };
    }),
  );

  const fabricate = (
    overrides?: Override<$Definition>,
    config?: { validate?: boolean },
  ): Fabricated<$Definition> => {
    if (overrides && config?.validate !== false) {
      /** Throws on an unknown key or a kind-violating value; result unused. */
      schema.override(overrides);
    }

    /** Each stage's fabricated values; an absent key has no entry. */
    const values = stages.map(() => new Map<string, unknown>());
    const deferred: Array<(typeof entries)[number]> = [];

    for (const entry of entries) {
      const { at, key, field, visible } = entry;

      if (isPollutionKey(key)) {
        throw new FabricatorError.PrototypePollutionError(key);
      }

      if (visible && overrides && key in overrides) {
        const value = overrides[key];

        /**
         * The override stands in for this field's draw, so a `T.unique.*` leaf
         * beneath it records the value and never draws it later.
         */
        recordOverride(field, value);

        /**
         * Forces this key off entirely — never written, not even as
         * `undefined`.
         */
        if (value === Omitted) continue;

        values[at]!.set(
          key,
          isObjectFabricator(field)
            ? field.fabricate(value as any, { validate: false })
            : value,
        );

        continue;
      }

      if (
        isObjectOmittableFabricator(field)
        || isObjectOptionalFabricator(field)
      ) {
        /**
         * Identical for both: `Omitted` means the key doesn't appear; anything
         * else — including `undefined`, for `object.optional`'s
         * present-as-`undefined` outcome — is written like an ordinary value.
         */
        const value = field.fabricate();
        if (value !== Omitted) values[at]!.set(key, value);
      } else if (isObjectComputeFabricator(field)) {
        deferred.push(entry);
      } else {
        values[at]!.set(key, field.fabricate());
      }
    }

    for (const { at, key, field, reads } of deferred) {
      const input: PlainObject = {};
      for (const [dependency, from] of reads) {
        const read = values[from];
        if (read?.has(dependency)) input[dependency] = read.get(dependency);
      }

      values[at]!.set(
        key,
        (field as ComputeFabricator<any, any>).fabricate({ fabricated: input }),
      );
    }

    const fabricated: PlainObject = {};
    for (const key of Object.keys(fields)) {
      const read = values[stageOf(stages, key)]!;
      if (read.has(key)) fabricated[key] = read.get(key);
    }

    return fabricated as Fabricated<$Definition>;
  };

  return {
    [Kind]: "object",
    [Meta]: schema[Meta],
    trace,
    [Children]: fields,
    fabricate,
    schema,
  };
}
