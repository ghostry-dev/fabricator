import { mergeAdaptations } from "../../Adapter/Core.ts";
import type { Adaptations } from "../../Adapter/Types.ts";
import { FabricatorError } from "../../Error/index.ts";
import { toSchema, toValueKind, violatesKind } from "../../Schema/Core.ts";
import { Adaptation, Fixed, Kind, Meta, Omitted } from "../../Types.ts";
import { isPlainObject } from "../../Utility/Core.ts";
import { type PlainObject } from "../../Utility/Types.ts";
import { isNullableSchema } from "../nullable/Schema.ts";
import { isNullishSchema } from "../nullish/Schema.ts";
import { isUndefinableSchema } from "../undefinable/Schema.ts";
import { default as computer } from "./compute/index.ts";
import { isObjectComputeSchema } from "./compute/Schema.ts";
import { isObjectOmittableSchema } from "./omittable/Schema.ts";
import { isObjectOptionalSchema } from "./optional/Schema.ts";
import { isObjectSchema, Schema } from "./Schema.ts";
import { prune, toDefinition, withEntries, type Stages } from "./Stages.ts";
import type {
  Definition,
  PlainFields,
  Subsettable,
  Meta as ThisMeta,
} from "./Types.ts";

function normalizeDefinition<$Definition extends Definition>(
  definition: $Definition,
): $Definition {
  return Object.fromEntries(
    Object.entries(definition).map(([k, v]) => [k, toSchema(v)]),
  ) as $Definition;
}

/**
 * {@link normalizeDefinition} for `T.object(...)` and `.extend(...)`, which take
 * ordinary fields only. A compute field reads the object as of the `.refine()`
 * stage that minted it, so it can only enter through that stage.
 */
function normalizeFields<$Definition extends Definition>(
  definition: $Definition,
  operation: "object" | "extend",
): $Definition {
  const normalized = normalizeDefinition(definition);
  for (const [key, entry] of Object.entries(normalized)) {
    if (isObjectComputeSchema(entry)) {
      throw new FabricatorError.ComputeOutsideRefineError(key, operation);
    }
  }
  return normalized;
}

/** `order` followed by each of `keys` it does not already have. */
function appendKeys(
  order: ReadonlyArray<string>,
  keys: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const known = new Set(order);
  return [...order, ...keys.filter((key) => !known.has(key))];
}

/**
 * Every object Schema is built here — `T.object`, each chained method,
 * `T.pick`/`T.omit`, and `rehydrate` — from its `stages` (`Stages.ts`) and the
 * visible key order. `prune` drops every entry nothing reads, and `definition`
 * is derived from what is left, so the two never disagree.
 *
 * `adaptations` is threaded through every branch rather than living on the
 * schema object: `extend`/`refine`/`override` each rebuild via `make`, so a map
 * left on the object alone would be dropped by the next chained call
 * (`Schema.ts`'s factory adds `as` and `satisfies` for this reason).
 *
 * `.extend()` and `.override()` write each field where it stands
 * (`withEntries`), so every compute field reading it follows. `.refine()`
 * appends a stage: a key it replaces gets a new version, and the replacing
 * field and every earlier compute field keep reading the previous one. A
 * compute field only reads earlier stages, so no cycle can form.
 */
function make<
  $Definition extends Definition,
  $Adaptations extends Adaptations = {},
>(
  allStages: Stages,
  order: ReadonlyArray<string>,
  adaptations?: $Adaptations | undefined,
): Schema<$Definition, $Adaptations> {
  const stages = prune(allStages, order);
  const definition = toDefinition(stages, order) as $Definition;

  const schema: Schema<$Definition, $Adaptations> = Schema({
    [Kind]: "object",
    [Meta]: { definition, stages },
    ...(adaptations ? { [Adaptation]: adaptations } : undefined),

    extend: (extender) => {
      const extension = normalizeFields(
        extender({ base: definition }),
        "extend",
      );
      /**
       * `any`: the merged definition's type is `Schema.ts`'s `ShallowMerge`,
       * which nothing here can name, and `stages` carries no type to infer it
       * from.
       */
      return make<any, $Adaptations>(
        withEntries(stages, extension),
        appendKeys(order, Object.keys(extension)),
        adaptations,
      );
    },

    refine: (refiner) => {
      const compute = computer<$Definition>(order);
      const refinement = normalizeDefinition(
        refiner({ base: schema, compute }),
      );
      /** `any`, as in `extend`. */
      return make<any, $Adaptations>(
        [...stages, refinement],
        appendKeys(order, Object.keys(refinement)),
        adaptations,
      );
    },

    adapt: (adapter, produce) =>
      make<$Definition, any>(
        stages,
        order,
        mergeAdaptations(adaptations, adapter, produce),
      ),

    /**
     * Pure Schema → Schema: never touches randomness. A present key skips
     * generation for that field — recorded via `[Fixed]` on a fresh copy of
     * that field's Schema entry (`Types.ts`), read only by `Constructor.ts`'s
     * `make`. A nested `object`-kind field recurses into its own
     * `.override(...)`, so deep-merging (and chained
     * `.override(a).override(b)`, `b` winning on conflicts) falls out: each
     * call only replaces the entries its own keys name, and prior overrides
     * already live in `definition`. Each fixed entry replaces the field's
     * current version where it stands, so compute fields reading it read the
     * fixed value.
     */
    override: (override) => {
      const overridden: PlainObject = {};

      for (const key of Object.keys(override)) {
        const fieldSchema = definition[key];
        if (!fieldSchema) {
          throw new FabricatorError.UnknownFieldError(
            key,
            Object.keys(definition),
            "override",
          );
        }

        const value = override[key];

        if (isObjectSchema(fieldSchema)) {
          if (!isPlainObject(value)) {
            throw new FabricatorError.InvalidOverrideValueError(
              key,
              "object",
              value,
            );
          }
          overridden[key] = toSchema(rehydrate(fieldSchema).override(value));
          continue;
        }

        if (isObjectOmittableSchema(fieldSchema)) {
          if (value === Omitted) {
            overridden[key] = { ...toSchema(fieldSchema), [Fixed]: Omitted };
            continue;
          }

          const innerKind = toValueKind(fieldSchema[Meta].definition);
          if (violatesKind(innerKind, value)) {
            throw new FabricatorError.InvalidOverrideValueError(
              key,
              innerKind,
              value,
            );
          }

          overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
          continue;
        }

        if (isObjectOptionalSchema(fieldSchema)) {
          if (value === Omitted || value === undefined) {
            overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
            continue;
          }

          const innerKind = toValueKind(fieldSchema[Meta].definition);
          if (violatesKind(innerKind, value)) {
            throw new FabricatorError.InvalidOverrideValueError(
              key,
              innerKind,
              value,
            );
          }

          overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
          continue;
        }

        if (isUndefinableSchema(fieldSchema)) {
          if (value !== undefined) {
            const innerKind = toValueKind(fieldSchema[Meta].definition);
            if (violatesKind(innerKind, value)) {
              throw new FabricatorError.InvalidOverrideValueError(
                key,
                innerKind,
                value,
              );
            }
          }

          overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
          continue;
        }

        if (isNullableSchema(fieldSchema)) {
          if (value !== null) {
            const innerKind = toValueKind(fieldSchema[Meta].definition);
            if (violatesKind(innerKind, value)) {
              throw new FabricatorError.InvalidOverrideValueError(
                key,
                innerKind,
                value,
              );
            }
          }

          overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
          continue;
        }

        if (isNullishSchema(fieldSchema)) {
          if (value !== null && value !== undefined) {
            const innerKind = toValueKind(fieldSchema[Meta].definition);
            if (violatesKind(innerKind, value)) {
              throw new FabricatorError.InvalidOverrideValueError(
                key,
                innerKind,
                value,
              );
            }
          }

          overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
          continue;
        }

        if (value === Omitted) {
          throw new FabricatorError.IllegalOmittedOverrideError(
            key,
            fieldSchema[Kind],
          );
        }

        const kind = toValueKind(fieldSchema);

        if (violatesKind(kind, value)) {
          throw new FabricatorError.InvalidOverrideValueError(key, kind, value);
        }

        overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
      }

      return make<$Definition, $Adaptations>(
        withEntries(stages, overridden as Definition),
        order,
        adaptations,
      );
    },
  });

  return schema;
}

/**
 * Rebuild a full `object` Schema — with `extend`/`refine` restored — from
 * anything already reduced to this kind's `[Meta]` (a bare Schema, or a built
 * Fabricator normalized via `toSchema`). `toSchema` alone only keeps
 * `[Kind]`/`[Meta]`, enough to fabricate from but not to derive a subtype —
 * this is what lets a built Fabricator's `.schema` still compose via
 * `extend`/`refine` (`Constructor.ts`'s `make`). Reattaches `produce` via
 * `.as(...)` when present, so a `toSchema`-stripped, `.as(...)`-produced schema
 * doesn't lose its custom producer — and carries `[Adaptation]` for the same
 * reason: without it, `.override(...)` on a nested adapted `object` field
 * (which round-trips through here) and a built Fabricator's `.schema` would
 * both silently come back unadapted.
 */
export function rehydrate<
  $Definition extends Definition,
  $Adaptations extends Adaptations = {},
>(schema: {
  [Meta]: ThisMeta<$Definition>;
  readonly [Adaptation]?: $Adaptations;
}): Schema<$Definition, $Adaptations> {
  const rehydrated = make<$Definition, $Adaptations>(
    schema[Meta].stages,
    Object.keys(schema[Meta].definition),
    schema[Adaptation],
  );
  return schema[Meta].produce
    ? rehydrated.as(schema[Meta].produce)
    : rehydrated;
}

/**
 * Shared body of `T.pick`/`T.omit` (`pick/Registry.ts`, `omit/Registry.ts`),
 * kept here because it rebuilds through `make`. A pure Schema → Schema
 * transform, like `.override()`: the result is an ordinary `object` Schema over
 * the kept fields, in source order. `make`'s `prune` keeps every version a kept
 * compute field reads, hidden — fabricated, so the resolver can read it, but
 * never emitted — and drops everything else.
 *
 * The source's own `produce` (`.as(...)`) and whole-object `[Adaptation]` are
 * not carried: both describe the source's full shape, not this one. Field
 * entries are reused as they are, so a kept or hidden field's own adaptation
 * and `[Fixed]` override come along.
 */
export function subset(
  source: Subsettable,
  keys: ReadonlyArray<string>,
  operation: "pick" | "omit",
): Schema<any> {
  const { definition, stages } = source[Meta];
  const available = Object.keys(definition);

  for (const key of keys) {
    if (!available.includes(key)) {
      throw new FabricatorError.UnknownFieldError(key, available, operation);
    }
  }

  const named = new Set(keys);
  const kept = available.filter((key): boolean => {
    switch (operation) {
      case "pick":
        return named.has(key);
      case "omit":
        return !named.has(key);
    }
  });

  return make(stages, kept);
}

export default <
  const $Definition extends Definition & PlainFields<$Definition>,
>(
  definition: $Definition,
): Schema<$Definition> => {
  const fields = normalizeFields(definition, "object");
  return make<$Definition>([fields], Object.keys(fields));
};
