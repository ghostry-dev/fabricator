import { mergeAdaptations } from "../../Adapter/Core";
import type { Adaptations } from "../../Adapter/Types";
import { FabricatorError } from "../../Error";
import { toSchema, violatesKind } from "../../Schema/Core";
import { Adaptation, Fixed, Kind, Meta, Omitted } from "../../Types";
import { isPlainObject } from "../../Utility/Core";
import { shallowMerge } from "../../Utility/ShallowMerge";
import { type PlainObject } from "../../Utility/Types";
import { isNullableSchema } from "../nullable/Schema";
import { isNullishSchema } from "../nullish/Schema";
import { isUndefinableSchema } from "../undefinable/Schema";
import { default as computer, isObjectComputeSchema } from "./compute";
import { isObjectOmittableSchema } from "./omittable/Schema";
import { isObjectOptionalSchema } from "./optional/Schema";
import { isObjectSchema, Schema } from "./Schema";
import type { Definition, Refinements, Meta as ThisMeta } from "./Types";

function normalizeDefinition<$Definition extends Definition>(
  definition: $Definition,
): $Definition {
  return Object.fromEntries(
    Object.entries(definition).map(([k, v]) => [k, toSchema(v)]),
  ) as $Definition;
}

/**
 * `adaptations` is threaded through every branch rather than living on the
 * schema object: `extend`/`refine`/`override` each rebuild via `make`, so a map
 * left on the object alone would be dropped by the next chained call
 * (`Schema.ts`'s factory adds only `as` for this reason).
 */
function make<
  $Definition extends Definition,
  $Adaptations extends Adaptations = {},
>(
  definition: $Definition,
  refinements: Refinements,
  adaptations?: $Adaptations | undefined,
): Schema<$Definition, $Adaptations> {
  const schema: Schema<$Definition, $Adaptations> = Schema({
    [Kind]: "object",
    [Meta]: { definition, refinements },
    ...(adaptations ? { [Adaptation]: adaptations } : undefined),

    extend: (extender) => {
      const extension = normalizeDefinition(extender({ base: definition }));
      const merged = shallowMerge(definition, extension);
      return make(merged, refinements, adaptations);
    },

    refine: (refiner) => {
      const compute = computer<$Definition>();
      const refinement = normalizeDefinition(
        refiner({ base: schema, compute }),
      );
      return make(
        shallowMerge(definition, refinement),
        [...refinements, refinement],
        adaptations,
      );
    },

    adapt: (adapter, produce) =>
      make(
        definition,
        refinements,
        mergeAdaptations(adaptations, adapter, produce),
      ),

    /**
     * Pure Schema → Schema: never touches randomness. A present key skips
     * generation for that field — recorded via `[Fixed]` on a fresh copy of
     * that field's Schema entry (`Types.ts`), read only by `Constructor.ts`'s
     * `make`. A nested `object`-kind field recurses into its own
     * `.override(...)`, so deep-merging (and chained
     * `.override(a).override(b)`, `b` winning on conflicts) falls out: each
     * call only replaces the definition entries its own keys name, and prior
     * overrides already live in `definition`.
     */
    override: (override) => {
      const overridden: PlainObject = { ...definition };

      for (const key of Object.keys(override)) {
        const fieldSchema = definition[key];
        if (!fieldSchema) {
          throw new FabricatorError.UnknownOverrideFieldError(
            key,
            Object.keys(definition),
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

          const innerKind = fieldSchema[Meta].definition[Kind];
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

          const innerKind = fieldSchema[Meta].definition[Kind];
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
            const innerKind = fieldSchema[Meta].definition[Kind];
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
            const innerKind = fieldSchema[Meta].definition[Kind];
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
            const innerKind = fieldSchema[Meta].definition[Kind];
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

        const kind = isObjectComputeSchema(fieldSchema)
          ? fieldSchema[Meta].source[Kind]
          : fieldSchema[Kind];

        if (violatesKind(kind, value)) {
          throw new FabricatorError.InvalidOverrideValueError(key, kind, value);
        }

        overridden[key] = { ...toSchema(fieldSchema), [Fixed]: value };
      }

      return make(overridden as $Definition, refinements, adaptations);
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
  const rehydrated = make(
    schema[Meta].definition,
    schema[Meta].refinements,
    schema[Adaptation],
  );
  return schema[Meta].produce
    ? rehydrated.as(schema[Meta].produce)
    : rehydrated;
}

export default <const $Definition extends Definition>(
  definition: $Definition,
): Schema<$Definition> => make(normalizeDefinition(definition), []);
