import { Kind } from "../Types";
import * as Primitive from "./namespace";

export { default as always } from "./always";
export { default as array } from "./array";
export { default as bigint } from "./bigint";
export { default as boolean } from "./boolean";
export { default as choice } from "./choice";
export { default as date } from "./date";
export { default as enum } from "./enum";
export { default as null } from "./null";
export { default as nullable } from "./nullable";
export { default as nullish } from "./nullish";
export { default as number } from "./number";
export { default as object } from "./object";
export { default as omittable } from "./object/omittable";
export { default as optional } from "./object/optional";
export { default as opaque } from "./opaque";
export { default as record } from "./record";
export { default as recursive } from "./recursive";
export { default as string } from "./string";
export { default as symbol } from "./symbol";
export { default as tuple } from "./tuple";
export { default as undefinable } from "./undefinable";
export { default as undefined } from "./undefined";

export { Primitive };

export type Fabricator =
  | Primitive.always.Fabricator<any>
  | Primitive.array.Fabricator<any>
  | Primitive.bigint.Fabricator
  | Primitive.boolean.Fabricator
  | Primitive.choice.Fabricator<any>
  | Primitive.date.Fabricator
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
