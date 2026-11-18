import { Kind } from "../Types.ts";
import * as Primitive from "./namespace.ts";

export { default as always } from "./always/index.ts";
export { default as array } from "./array/index.ts";
export { default as bigint } from "./bigint/index.ts";
export { default as boolean } from "./boolean/index.ts";
export { default as choice } from "./choice/index.ts";
export { default as date } from "./date/index.ts";
export { default as derive } from "./derive/index.ts";
export { default as enum } from "./enum/index.ts";
export { default as null } from "./null/index.ts";
export { default as nullable } from "./nullable/index.ts";
export { default as nullish } from "./nullish/index.ts";
export { default as number } from "./number/index.ts";
export { default as object } from "./object/index.ts";
export { default as omit } from "./object/omit/index.ts";
export { default as omittable } from "./object/omittable/index.ts";
export { default as optional } from "./object/optional/index.ts";
export { default as pick } from "./object/pick/index.ts";
export { default as opaque } from "./opaque/index.ts";
export { default as record } from "./record/index.ts";
export { default as recursive } from "./recursive/index.ts";
export { default as string } from "./string/index.ts";
export { default as symbol } from "./symbol/index.ts";
export { default as tuple } from "./tuple/index.ts";
export { default as undefinable } from "./undefinable/index.ts";
export { default as unique } from "./unique/index.ts";
export { default as undefined } from "./undefined/index.ts";

export { Primitive };

export type Fabricator =
  | Primitive.always.Fabricator<any>
  | Primitive.array.Fabricator<any>
  | Primitive.bigint.Fabricator
  | Primitive.boolean.Fabricator
  | Primitive.choice.Fabricator<any>
  | Primitive.date.Fabricator
  | Primitive.derive.Fabricator<any>
  | Primitive.enum.Fabricator<any>
  | Primitive.null.Fabricator
  | Primitive.nullable.Fabricator<any>
  | Primitive.nullish.Fabricator<any>
  | Primitive.number.Fabricator
  | Primitive.object.Fabricator<any>
  | Primitive.object.compute.Fabricator<any, any>
  | Primitive.object.omittable.Fabricator<any>
  | Primitive.object.optional.Fabricator<any>
  | Primitive.opaque.Fabricator<any>
  | Primitive.record.Fabricator<any>
  | Primitive.recursive.Fabricator<any>
  | Primitive.recursive.self.Fabricator<any>
  | Primitive.string.Fabricator
  | Primitive.symbol.Fabricator
  | Primitive.tuple.Fabricator<any>
  | Primitive.undefined.Fabricator
  | Primitive.undefinable.Fabricator<any>;

export type Schema =
  | Primitive.always.Schema<any>
  | Primitive.array.Schema<any>
  | Primitive.bigint.Schema
  | Primitive.boolean.Schema
  | Primitive.choice.Schema<any>
  | Primitive.date.Schema
  | Primitive.derive.Schema<any, any>
  | Primitive.enum.Schema<any>
  | Primitive.null.Schema
  | Primitive.nullable.Schema<any>
  | Primitive.nullish.Schema<any>
  | Primitive.number.Schema
  | Primitive.object.Schema<any>
  | Primitive.object.compute.Schema<any, any>
  | Primitive.object.omittable.Schema<any>
  | Primitive.object.optional.Schema<any>
  | Primitive.opaque.Schema<any>
  | Primitive.record.Schema<any, any>
  | Primitive.recursive.Schema<any>
  | Primitive.recursive.self.Schema<any>
  | Primitive.string.Schema
  | Primitive.symbol.Schema
  | Primitive.tuple.Schema<any>
  | Primitive.undefined.Schema
  | Primitive.undefinable.Schema<any>;

export type Kind = Schema[typeof Kind];
