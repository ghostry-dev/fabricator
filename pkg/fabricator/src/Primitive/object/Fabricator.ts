import type { AdaptationsOf } from "../../Adapter/Types";
import { FabricatorError } from "../../Error";
import type {
  Fabricator as BaseFabricator,
  FabricatorContext,
} from "../../Fabricator/Types";
import type { Trace } from "../../Random/Types";
import { toStreamFromTrace } from "../../Random";
import { Children, Kind, Meta, Omitted, type Adaptation } from "../../Types";
import { isPollutionKey } from "../../Utility/Core";
import { type PlainObject } from "../../Utility/Types";
import {
  isObjectComputeFabricator,
  type Fabricator as ComputeFabricator,
} from "./compute/Fabricator";
import { isObjectOmittableFabricator } from "./omittable/Fabricator";
import { isObjectOptionalFabricator } from "./optional/Fabricator";
import type { Schema } from "./Schema";
import type {
  Definition,
  Fabricated,
  Override,
  Meta as ThisMeta,
} from "./Types";

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
   * when recursing into an already-validated nested override, also available
   * to a caller who already knows their overrides are valid.
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
 * `Types.ts`) are already resolved into literal-valued `fields` entries
 * before they reach here. `fabricate`'s `overrides` (below) is a separate
 * per-call mechanism; the two compose.
 *
 * `schema` is echoed as `.schema` unchanged — callers wanting a
 * `toSchema`-normalized Fabricator (no `extend`/`refine`/`override`) pass
 * that; `Constructor.ts`'s `make` passes `object.rehydrate(...)` so a
 * top-level built Fabricator's `.schema` still composes.
 *
 * A compute-kind field (from `.refine()`) needs the rest of the object
 * already fabricated (`object/compute/Fabricator.ts`), which isn't available
 * until every ordinary field has resolved. Two phases: ordinary fields
 * first, then compute fields against the accumulated result, in definition
 * order (a compute field can see an earlier compute field's value, not a
 * later one) — unless covered by `overrides`, in which case it resolves in
 * phase 1 like any other overridden field.
 */
export function Fabricator<$Definition extends Definition>(
  context: FabricatorContext<Schema<$Definition>>,
  fields: Fields,
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

  const fabricate = (
    overrides?: Override<$Definition>,
    config?: { validate?: boolean },
  ): Fabricated<$Definition> => {
    if (overrides && config?.validate !== false) {
      /** Throws on an unknown key or a kind-violating value; result unused. */
      schema.override(overrides);
    }

    const fabricated: PlainObject = {};
    const deferred: Array<[string, ComputeFabricator<any, any>]> = [];

    for (const [k, v] of Object.entries(fields)) {
      if (isPollutionKey(k)) {
        throw new FabricatorError.PrototypePollutionError(k);
      }

      if (overrides && k in overrides) {
        const value = overrides[k];
        /** Forces this key off entirely — never written, not even as `undefined`. */
        if (value === Omitted) continue;

        fabricated[k] = isObjectFabricator(v)
          ? v.fabricate(value as any, { validate: false })
          : value;

        continue;
      }

      if (isObjectOmittableFabricator(v) || isObjectOptionalFabricator(v)) {
        /**
         * Identical for both: `Omitted` means the key doesn't appear;
         * anything else — including `undefined`, for `object.optional`'s
         * present-as-`undefined` outcome — is written like an ordinary value.
         */
        const value = v.fabricate();
        if (value !== Omitted) fabricated[k] = value;
      } else if (isObjectComputeFabricator(v)) {
        deferred.push([k, v]);
      } else {
        fabricated[k] = v.fabricate();
      }
    }

    for (const [k, v] of deferred) {
      fabricated[k] = v.fabricate({ fabricated });
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
