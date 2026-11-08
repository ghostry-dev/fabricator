import type { AdmittedEnds } from "../../Bound";
import { FabricatorError } from "../../Error";
import type { Primitive, Kind as SchemaKind } from "../../Primitive";
import type { AnySchema } from "../../Schema/Types";
import { Adaptation, Kind, Meta, Omitted } from "../../Types";
import { never } from "../../Utility/Core";
import type { PlainObject } from "../../Utility/Types";
import { toStatedSize } from "../record/Admits";

/**
 * Derive the schema that `fabricateAt` swaps in at `depth.max` when the caller
 * omits `terminal`. Walks `body` and rewrites every `self` site into a
 * declining state so the result contains _no_ `recursive.self` nodes —
 * `Constructor.ts`'s `make` still dispatches nested schemas eagerly, and
 * `recursive.self` throws when `context.self` is missing (which it is, at the
 * ceiling).
 *
 * Empty collections are `opaque(() => [])` / `opaque(() => ({}))`, never
 * `always([])`: each leaf must get its own reference (see `Recursive.test.ts`).
 * Presence wrappers become a self-free schema that always declines (`null` /
 * `undefined` / `Omitted`), rather than keeping the inner `self` behind a
 * produce short-circuit — `make` would still construct that inner node.
 *
 * Nested `T.recursive` is its own fixed point and is treated as a leaf; its
 * inner `self` is not this walk's `self`.
 *
 * An emptied collection must not state a minimum above 0: an adapter states it
 * as written, for every level of the tree, and every branch ends here empty, so
 * no finite tree would validate. {@link assertEmptiable} throws
 * `UnsatisfiableRecursiveBoundError` instead. A wrapper above the collection
 * declines first (`T.optional(T.array(self))` becomes omitted), so only a
 * collection this walk empties is checked.
 */
export function terminate(body: AnySchema): AnySchema {
  return terminateAt(body, []);
}

function terminateAt(schema: any, path: ReadonlyArray<string>): AnySchema {
  const kind: SchemaKind = schema[Kind];

  switch (kind) {
    case "recursive.self":
      throw new FabricatorError.UnterminableRecursiveError(path);

    case "array": {
      const s = schema as Primitive.array.Schema;
      if (!containsSelf(s[Meta].definition)) return schema;

      const meta = s[Meta];
      assertEmptiable(
        path,
        "length",
        meta.admits ? meta.admits.length : meta.whereby?.length,
      );
      return emptyArray();
    }

    case "record": {
      const s = schema as Primitive.record.Schema;
      if (!containsSelf(s[Meta].key) && !containsSelf(s[Meta].value)) {
        return schema;
      }

      const meta = s[Meta];
      assertEmptiable(
        path,
        "size",
        meta.admits ? meta.admits.size : toStatedSize(meta),
      );
      return emptyRecord();
    }

    case "choice": {
      const s = schema as Primitive.choice.Schema;
      const items = s[Meta].items;
      const kept = items.filter(([, option]) => !containsSelf(option));
      if (kept.length === 0) {
        throw new FabricatorError.UnterminableRecursiveError(path);
      }
      return withMeta(s, { ...s[Meta], items: kept });
    }

    case "nullable": {
      const s = schema as Primitive.nullable.Schema;
      return containsSelf(s[Meta].definition) ? alwaysNull() : schema;
    }

    case "nullish": {
      const s = schema as Primitive.nullish.Schema;
      return containsSelf(s[Meta].definition) ? alwaysNull() : schema;
    }

    case "undefinable": {
      const s = schema as Primitive.undefinable.Schema;
      return containsSelf(s[Meta].definition) ? alwaysUndefined() : schema;
    }

    case "object.omittable": {
      const s = schema as Primitive.object.omittable.Schema;
      return containsSelf(s[Meta].definition) ? alwaysOmitted(kind) : schema;
    }

    case "object.optional": {
      const s = schema as Primitive.object.optional.Schema;
      return containsSelf(s[Meta].definition) ? alwaysOmitted(kind) : schema;
    }

    case "object": {
      const s = schema as Primitive.object.Schema;

      const terminateFields = (
        definition: Primitive.object.Definition,
      ): Record<string, AnySchema> => {
        const next: Record<string, AnySchema> = {};
        for (const key of Object.keys(definition)) {
          next[key] = terminateAt(definition[key]!, [...path, key]);
        }
        return next;
      };

      const definition = terminateFields(s[Meta].definition);
      if (!s[Meta].hidden) return withMeta(s, { ...s[Meta], definition });

      /**
       * A hidden field (`object/Types.ts`'s `Meta`) is dispatched exactly as a
       * visible one is, so its `self` needs the same stop — or the same
       * `UnterminableRecursiveError`.
       */
      const hidden = terminateFields(s[Meta].hidden);
      return withMeta(s, { ...s[Meta], definition, hidden });
    }

    case "tuple": {
      const s = schema as Primitive.tuple.Schema;
      return withMeta(s, {
        ...s[Meta],
        items: s[Meta].items.map((item, i) =>
          terminateAt(item, [...path, String(i)]),
        ),
      });
    }

    /**
     * `to` is left alone even when it contains `self`: it only declares the
     * result's type and is never dispatched, so it cannot recurse. Unlike
     * `object.compute`'s `source`, nothing here needs to throw.
     */
    case "derive": {
      const s = schema as Primitive.derive.Schema;
      return withMeta(s, {
        ...s[Meta],
        from: s[Meta].from.map((item, i) =>
          terminateAt(item, [...path, "from", String(i)]),
        ),
      });
    }

    case "object.compute": {
      const s = schema as Primitive.object.compute.Schema<any, any>;
      if (containsSelf(s[Meta].source)) {
        throw new FabricatorError.UnterminableRecursiveError([
          ...path,
          "source",
        ]);
      }
      return schema;
    }

    case "recursive":
    case "always":
    case "bigint":
    case "boolean":
    case "date":
    case "enum":
    case "null":
    case "number":
    case "opaque":
    case "string":
    case "symbol":
    case "undefined":
      return schema;

    default:
      return never(kind);
  }
}

function containsSelf(schema: any): boolean {
  const kind: SchemaKind = schema[Kind];

  switch (kind) {
    case "recursive.self":
      return true;

    case "recursive":
      return false;

    case "array": {
      const s = schema as Primitive.array.Schema;
      return containsSelf(s[Meta].definition);
    }

    case "nullable": {
      const s = schema as Primitive.nullable.Schema;
      return containsSelf(s[Meta].definition);
    }

    case "nullish": {
      const s = schema as Primitive.nullish.Schema;
      return containsSelf(s[Meta].definition);
    }

    case "undefinable": {
      const s = schema as Primitive.undefinable.Schema;
      return containsSelf(s[Meta].definition);
    }

    case "object.omittable": {
      const s = schema as Primitive.object.omittable.Schema;
      return containsSelf(s[Meta].definition);
    }

    case "object.optional": {
      const s = schema as Primitive.object.optional.Schema;
      return containsSelf(s[Meta].definition);
    }

    case "record": {
      const s = schema as Primitive.record.Schema;
      return containsSelf(s[Meta].key) || containsSelf(s[Meta].value);
    }

    case "choice": {
      const s = schema as Primitive.choice.Schema;
      return s[Meta].items.some(([, option]) => containsSelf(option));
    }

    case "object": {
      const s = schema as Primitive.object.Schema;
      const all = { ...s[Meta].hidden, ...s[Meta].definition };
      return Object.keys(all).some((key) => containsSelf(all[key]!));
    }

    case "tuple": {
      const s = schema as Primitive.tuple.Schema;
      return s[Meta].items.some((item) => containsSelf(item));
    }

    case "derive": {
      const s = schema as Primitive.derive.Schema;
      return s[Meta].from.some((item) => containsSelf(item));
    }

    case "object.compute": {
      const s = schema as Primitive.object.compute.Schema<any, any>;
      return containsSelf(s[Meta].source);
    }

    case "always":
    case "bigint":
    case "boolean":
    case "date":
    case "enum":
    case "null":
    case "number":
    case "opaque":
    case "string":
    case "symbol":
    case "undefined":
      return false;

    default:
      return never(kind);
  }
}

/**
 * The stated ends are `.admits`'s when set — complete, so an absent `min` there
 * states none — else the written ones, which is what an adapter states.
 */
function assertEmptiable(
  path: ReadonlyArray<string>,
  key: "length" | "size",
  stated: AdmittedEnds<number> | undefined,
): void {
  const min = stated?.min;
  if (!min) return;

  const smallest = min.exclusive ? min.value + 1 : min.value;
  if (smallest > 0) {
    throw new FabricatorError.UnsatisfiableRecursiveBoundError(
      path,
      key,
      smallest,
    );
  }
}

function withMeta(schema: AnySchema, meta: PlainObject): AnySchema {
  const adaptations = schema[Adaptation];
  return adaptations
    ? { [Kind]: schema[Kind], [Meta]: meta, [Adaptation]: adaptations }
    : { [Kind]: schema[Kind], [Meta]: meta };
}

function emptyArray(): AnySchema {
  return { [Kind]: "opaque", [Meta]: { produce: () => [] } };
}

function emptyRecord(): AnySchema {
  return { [Kind]: "opaque", [Meta]: { produce: () => ({}) } };
}

function alwaysNull(): AnySchema {
  return { [Kind]: "null", [Meta]: {} };
}

function alwaysUndefined(): AnySchema {
  return { [Kind]: "undefined", [Meta]: {} };
}

function alwaysOmitted(
  kind: "object.omittable" | "object.optional",
): AnySchema {
  return {
    [Kind]: kind,
    [Meta]: { definition: alwaysNull(), produce: () => Omitted },
  };
}
