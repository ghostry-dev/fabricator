import { mergeAdaptations } from "../../Adapter/Core";
import type { Adaptations } from "../../Adapter/Types";
import { FabricatorError } from "../../Error";
import { toSchema, toValueKind, violatesKind } from "../../Schema/Core";
import type { AnySchema } from "../../Schema/Types";
import { Adaptation, Fixed, Kind, Meta, Omitted } from "../../Types";
import { isPlainObject } from "../../Utility/Core";
import { shallowMerge } from "../../Utility/ShallowMerge";
import { type PlainObject } from "../../Utility/Types";
import { isNullableSchema } from "../nullable/Schema";
import { isNullishSchema } from "../nullish/Schema";
import { isUndefinableSchema } from "../undefinable/Schema";
import { default as computer } from "./compute";
import { isObjectComputeSchema } from "./compute/Schema";
import { isObjectOmittableSchema } from "./omittable/Schema";
import { isObjectOptionalSchema } from "./optional/Schema";
import { isObjectSchema, Schema } from "./Schema";
import type {
  Definition,
  Refinements,
  Subsettable,
  Meta as ThisMeta,
} from "./Types";

function normalizeDefinition<$Definition extends Definition>(
  definition: $Definition,
): $Definition {
  return Object.fromEntries(
    Object.entries(definition).map(([k, v]) => [k, toSchema(v)]),
  ) as $Definition;
}

/**
 * Drop every hidden field that `added` now defines visibly — the visible entry
 * replaces it, and a compute field depending on that key reads the new one —
 * and drop `hidden` itself once nothing is left in it, so `[Meta]` never
 * carries an empty one.
 */
function unhide(
  hidden: Definition | undefined,
  added: Definition,
): Definition | undefined {
  if (!hidden) return undefined;

  const remaining = Object.fromEntries(
    Object.entries(hidden).filter(([key]) => !(key in added)),
  );
  return Object.keys(remaining).length > 0 ? remaining : undefined;
}

/**
 * `adaptations` is threaded through every branch rather than living on the
 * schema object: `extend`/`refine`/`override` each rebuild via `make`, so a map
 * left on the object alone would be dropped by the next chained call
 * (`Schema.ts`'s factory adds `as` and `satisfies` for this reason). `hidden`
 * (`Types.ts`'s `Meta`) is threaded the same way.
 *
 * Every object Schema is built here — `T.object`, each chained method,
 * `T.pick`/`T.omit`, and `rehydrate` — which is what makes it the one place
 * `assertAcyclic` needs to run for no cyclic Schema to exist at all.
 */
function make<
  $Definition extends Definition,
  $Adaptations extends Adaptations = {},
>(
  definition: $Definition,
  refinements: Refinements,
  adaptations?: $Adaptations | undefined,
  hidden?: Definition | undefined,
): Schema<$Definition, $Adaptations> {
  assertAcyclic({ ...hidden, ...definition });

  const schema: Schema<$Definition, $Adaptations> = Schema({
    [Kind]: "object",
    [Meta]: hidden
      ? { definition, refinements, hidden }
      : { definition, refinements },
    ...(adaptations ? { [Adaptation]: adaptations } : undefined),

    extend: (extender) => {
      const extension = normalizeDefinition(extender({ base: definition }));
      const merged = shallowMerge(definition, extension);
      return make(merged, refinements, adaptations, unhide(hidden, extension));
    },

    refine: (refiner) => {
      const compute = computer<$Definition>(Object.keys(definition));
      const refinement = normalizeDefinition(
        refiner({ base: schema, compute }),
      );
      return make(
        shallowMerge(definition, refinement),
        [...refinements, refinement],
        adaptations,
        unhide(hidden, refinement),
      );
    },

    adapt: (adapter, produce) =>
      make(
        definition,
        refinements,
        mergeAdaptations(adaptations, adapter, produce),
        hidden,
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

      return make(overridden as $Definition, refinements, adaptations, hidden);
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
    schema[Meta].hidden,
  );
  return schema[Meta].produce
    ? rehydrated.as(schema[Meta].produce)
    : rehydrated;
}

/**
 * The fields a field entry needs fabricated beside it. A compute field needs
 * its `dependencies` (`compute/Types.ts`), unless `.override()` fixed its
 * value, in which case its resolver never runs. Every other entry needs
 * nothing.
 */
function dependenciesOf(entry: AnySchema): ReadonlyArray<string> {
  if (Fixed in entry) return [];
  if (!isObjectComputeSchema(entry)) return [];
  return entry[Meta].dependencies;
}

/**
 * Throw `ComputeDependencyCycleError` if compute fields in `all` (visible and
 * hidden alike) depend on each other in a loop. A dependency only ever names a
 * field that exists when the compute field is minted, but a later
 * `.refine()`/`.extend()` can replace that field with a compute field reading
 * it back. A `[Fixed]` compute field breaks a loop (`dependenciesOf`), since it
 * resolves in phase 1 without reading anything. Checked at build time so
 * `object/Fabricator.ts`'s `resolveComputed` can assume there is none.
 */
function assertAcyclic(all: Definition): void {
  const visiting: string[] = [];
  const visited = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) return;

    const entry = all[key];
    if (!entry) return;

    if (visiting.includes(key)) {
      const loop = visiting.slice(visiting.indexOf(key));
      throw new FabricatorError.ComputeDependencyCycleError([...loop, key]);
    }

    visiting.push(key);
    for (const dependency of dependenciesOf(entry)) visit(dependency);
    visiting.pop();

    visited.add(key);
  };

  for (const key of Object.keys(all)) visit(key);
}

/**
 * Every key `kept` needs fabricated, `kept` included, following compute fields'
 * dependencies transitively through `all` (visible and hidden fields alike). A
 * dependency that `all` does not define is still collected, and simply matches
 * no entry.
 */
function requiredKeys(
  kept: ReadonlyArray<string>,
  all: Definition,
): ReadonlySet<string> {
  const needed = new Set(kept);
  const pending = [...kept];

  while (pending.length > 0) {
    const entry = all[pending.pop()!];
    if (!entry) continue;

    for (const dependency of dependenciesOf(entry)) {
      if (needed.has(dependency)) continue;
      needed.add(dependency);
      pending.push(dependency);
    }
  }

  return needed;
}

function selectEntries(
  definition: Definition,
  keys: ReadonlySet<string>,
): Definition {
  return Object.fromEntries(
    Object.entries(definition).filter(([key]) => keys.has(key)),
  );
}

/**
 * Shared body of `T.pick`/`T.omit` (`pick/Registry.ts`, `omit/Registry.ts`),
 * kept here because it rebuilds through `make`. A pure Schema → Schema
 * transform, like `.override()`: the result is an ordinary `object` Schema over
 * the kept fields, in source order. A dependency of a kept compute field that
 * is not itself kept moves to `[Meta].hidden` — fabricated, so the resolver can
 * read it, but never emitted. A dropped field nothing depends on is gone
 * entirely.
 *
 * The source's own `produce` (`.as(...)`) and whole-object `[Adaptation]` are
 * not carried: both describe the source's full shape, not this one. Field
 * entries are reused as they are, so a kept or hidden field's own adaptation
 * and `[Fixed]` override come along. `refinements` is filtered down to the kept
 * fields.
 */
export function subset(
  source: Subsettable,
  keys: ReadonlyArray<string>,
  operation: "pick" | "omit",
): Schema<any> {
  const { definition, refinements, hidden } = source[Meta];
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
  const keptSet = new Set(kept);

  const all: Definition = { ...hidden, ...definition };
  const required = requiredKeys(kept, all);
  const hiddenKeys = new Set(
    Object.keys(all).filter((key) => required.has(key) && !keptSet.has(key)),
  );

  return make(
    selectEntries(definition, keptSet),
    refinements
      .map((refinement) => selectEntries(refinement, keptSet))
      .filter((refinement) => Object.keys(refinement).length > 0),
    undefined,
    hiddenKeys.size > 0 ? selectEntries(all, hiddenKeys) : undefined,
  );
}

export default <const $Definition extends Definition>(
  definition: $Definition,
): Schema<$Definition> => make(normalizeDefinition(definition), []);
