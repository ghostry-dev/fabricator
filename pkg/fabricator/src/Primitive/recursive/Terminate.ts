import { FabricatorError } from "../../Error";
import type { Kind as SchemaKind, Primitive } from "../../Primitive";
import type { AnySchema } from "../../Schema/Types";
import { Adaptation, Kind, Meta, Omitted } from "../../Types";
import { never } from "../../Utility/Core";
import type { PlainObject } from "../../Utility/Types";

/**
 * Derive the schema that `fabricateAt` swaps in at `depth.max` when the
 * caller omits `terminal`. Walks `body` and rewrites every `self` site
 * into a declining state so the result contains *no* `recursive.self`
 * nodes — `Constructor.ts`'s `make` still dispatches nested schemas
 * eagerly, and `recursive.self` throws when `context.self` is missing
 * (which it is, at the ceiling).
 *
 * Empty collections are `opaque(() => [])` / `opaque(() => ({}))`,
 * never `always([])`: each leaf must get its own reference (see
 * `Recursive.test.ts`). Presence wrappers become a self-free schema
 * that always declines (`null` / `undefined` / `Omitted`), rather than
 * keeping the inner `self` behind a produce short-circuit — `make`
 * would still construct that inner node.
 *
 * Nested `T.recursive` is its own fixed point and is treated as a
 * leaf; its inner `self` is not this walk's `self`.
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
      return containsSelf(s[Meta].definition) ? emptyArray() : schema;
    }

    case "record": {
      const s = schema as Primitive.record.Schema;
      return containsSelf(s[Meta].key) || containsSelf(s[Meta].value)
        ? emptyRecord()
        : schema;
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
      const definition = s[Meta].definition;
      const next: Record<string, AnySchema> = {};
      for (const key of Object.keys(definition)) {
        next[key] = terminateAt(definition[key]!, [...path, key]);
      }
      return withMeta(s, { ...s[Meta], definition: next });
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
      const definition = s[Meta].definition;
      return Object.keys(definition).some((key) =>
        containsSelf(definition[key]!),
      );
    }

    case "tuple": {
      const s = schema as Primitive.tuple.Schema;
      return s[Meta].items.some((item) => containsSelf(item));
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
