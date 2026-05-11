import {
  FabricatorError,
  drive,
  effectiveDiscrete,
  type AdaptationsOf,
  type Adapter,
  type Bound,
  type Recurse,
} from "@ghostry/fabricator";
import {
  Kind,
  Meta,
  isPlainObject,
  type Buildable,
  type Primitive,
} from "@ghostry/fabricator/internal";
import {
  Type,
  Kind as TypeBoxKind,
  type TArray,
  type TBigInt,
  type TBoolean,
  type TConst,
  type TDate,
  type TInteger,
  type TNull,
  type TNumber,
  type TObject,
  type TOptional,
  type TRecordOrObject,
  type TRecursive,
  type TSchema,
  type TString,
  type TSymbol,
  type TThis,
  type TTuple,
  type TUndefined,
  type TUnion,
  type TUnknown,
  type Union,
} from "@sinclair/typebox";

/**
 * This adapter's `[Adaptation]` namespace. Versioned because
 * `@sinclair/typebox` (0.34.x) and the unscoped `typebox` (1.x) are
 * separate packages, not a continuation — a schema can carry both at
 * once, and neither is mistaken for the other.
 *
 * Nothing outside this file writes it: `.adapt(typebox, ...)` reads it
 * off {@link typebox}. Naming it wrong is an import error, not an
 * entry nothing looks up.
 */
const key = "@ghostry/fabricator-typebox/v0";
type Key = typeof key;

type Returnable = TSchema;

/**
 * Tuple-preserving map from a `choice`'s `[weight, option]` pairs to each
 * option's `ToTypeBox<...>`. Head/tail recursion, not a homomorphic
 * `{ [$K in keyof $Items]: ... }`: the latter can't be proven
 * `TSchema[]`-shaped while `$Items` is only the general `Primitive.choice.Items`
 * bound (`keyof` a still-abstract array-constrained parameter pulls in
 * `"length"`/method keys, which don't resolve to `TSchema`). Matching
 * `readonly [infer $Head, ...infer $Rest]` re-verifies `TSchema[]` at
 * every step, so it type-checks whether `$Items` is abstract (inside
 * `ToTypeBox`'s generic body) or already a concrete tuple.
 *
 * Three outcomes, matching TypeBox's `Union<Types extends
 * TSchema[]>(types: [...Types])`:
 * - Empty tuple (`$Items` is `readonly []`, e.g. `T.choice.uniform([])`)
 *   → `[]`; `Union<[]>` is `TNever`, matching `Type.Union([])`.
 * - Non-empty tuple → same-length tuple, so `Union<T>` can apply its
 *   single-vs-multi collapse.
 * - Widened array (`$Items` inferred as `ReadonlyArray<...>` with no
 *   known length — options built elsewhere and passed as a variable,
 *   not a fresh literal) matches neither tuple pattern → arity-less
 *   `ToTypeBox<...>[]`. `Union<T>` then resolves to
 *   `TUnion<ToTypeBox<...>[]>` — the same "union of unknown arity"
 *   `Type.Union` falls back to when it can't infer a literal tuple —
 *   not the `TNever` a two-way (tuple-or-empty) split would give.
 */
type ChoiceOptions<$Items extends Primitive.choice.Items> =
  $Items extends readonly []
    ? []
    : $Items extends readonly [
          infer $Head extends readonly [number, Primitive.choice.Item],
          ...infer $Rest extends Primitive.choice.Items,
        ]
      ? [
          $Head extends readonly [number, infer $Option]
            ? ToTypeBox<$Option>
            : never,
          ...ChoiceOptions<$Rest>,
        ]
      : ToTypeBox<$Items[number][1]>[];

/**
 * Tuple-preserving map from a `tuple`'s slot schemas to each slot's
 * `ToTypeBox<...>`. Same head/tail recursion as {@link ChoiceOptions},
 * same reason: `TTuple<T extends TSchema[]>` needs `T` provably
 * `TSchema[]` at every step, which a homomorphic
 * `{ [$K in keyof $Items]: ... }` can't guarantee while `$Items` is
 * only the general `Primitive.tuple.Items` bound. No single-item collapse —
 * `Type.Tuple` / `TTuple` never collapses — so only empty, non-empty,
 * and the widened-array fallback.
 */
type TupleItems<$Items extends Primitive.tuple.Items> =
  $Items extends readonly []
    ? []
    : $Items extends readonly [
          infer $Head extends Primitive.tuple.Item,
          ...infer $Rest extends Primitive.tuple.Items,
        ]
      ? [ToTypeBox<$Head>, ...TupleItems<$Rest>]
      : ToTypeBox<$Items[number]>[];

/**
 * TypeBox counterpart of a fixed JS value — what `always` and `enum`
 * (members are values, not schemas) map to. Neither kind is capped at
 * `string | number | boolean`.
 *
 * TypeBox's `TConst` already dispatches: `TLiteral` for the three
 * literal-able types, `TNull`/`TUndefined`/`TBigInt`/`TDate`/`TSymbol`/
 * `TUint8Array` for the rest, recursing through objects and arrays.
 * Runtime `toConst` pins exact values via option bags, but options are
 * invisible to `Static<>` (`Static<TBigInt>` is `bigint` either way),
 * so nothing extra is expressible here and the two sides stay in
 * agreement.
 *
 * `unknown extends $Value` is load-bearing: `TConst<unknown>` resolves
 * to `TObject<{}>`, not `TSchema`, so a bare unparameterized
 * `Primitive.always.Core` would claim to be an empty object instead of falling
 * back to `TSchema`. Guard:
 * `test/Adapter/TypeBox/index.types.test.ts`'s bare-vs-concrete
 * assertion — same trap as `tuple`'s `TupleItems`.
 */
type ToConst<$Value> = unknown extends $Value ? Returnable : TConst<$Value>;

/**
 * Tuple-preserving map from an `enum`'s `[weight, item]` pairs to each
 * member's {@link ToConst}. Same head/tail recursion as
 * {@link ChoiceOptions} (see that comment for why a homomorphic mapped
 * type fails, and what the three branches mean).
 *
 * Difference: `enum` members are *values*, so they map through
 * `ToConst` rather than recursing into `ToTypeBox` the way a `choice`'s
 * option Schemas do — mirroring `convert()`'s `enum` case (`toConst`
 * per member, not `convert`).
 */
type EnumOptions<$Items extends Primitive.enum.Items> =
  $Items extends readonly []
    ? []
    : $Items extends readonly [
          infer $Head extends readonly [number, Primitive.enum.Item],
          ...infer $Rest extends Primitive.enum.Items,
        ]
      ? [
          $Head extends readonly [number, infer $Item] ? ToConst<$Item> : never,
          ...EnumOptions<$Rest>,
        ]
      : ToConst<$Items[number][1]>[];

/**
 * TypeBox schema type a Schema corresponds to — identical to writing
 * the schema by hand with `Type.*`.
 *
 * Mirrors {@link Fabrication}: composites (`object`, `array`,
 * `object.compute`) recurse into children; every leaf maps to its
 * TypeBox counterpart. `always` (and each `enum` member) maps through
 * {@link ToConst}; anything else falls back to `TSchema`.
 */
/* prettier-ignore */
export type ToTypeBox<$Schema> =
  /**
   * An explicit adaptation wins over every kind's mapping, so this
   * comes first — an adapted `object` would otherwise match the branch
   * below. `AdaptationsOf` (not `{ [Adaptation]?: Record<Key, ...> }`)
   * keeps an *unadapted* schema out of this branch; see that helper.
   *
   * Keyed by this adapter's {@link Key}: an adaptation for a
   * *different* adapter — including TypeBox 1.x, whose schemas this
   * one cannot represent — is carried past untouched.
   *
   * `...args: any` rather than `(schema: any)` so the match is
   * indifferent to how precisely the stored adaptation types its
   * parameter. `infer ... extends TSchema` is belt-and-braces:
   * `.adapt(typebox, ...)` already checks the return type at the call
   * site; this keeps a hand-written `[Adaptation]` map
   * (`Adapt.types.test.ts` builds one to assert the runtime shape)
   * from poisoning the mapping.
   */
  AdaptationsOf<$Schema> extends Record<
    Key,
    (...args: any) => infer $Returnable extends Returnable
  >
    ? $Returnable :

  /**
   * Structural checks, not `$Schema extends Primitive.bigint.Schema`: every leaf
   * kind's (and `array`'s) `Schema` requires an `as` method a built
   * Fabricator never has, so a nominal check never matches a built one
   * (`object` needs the same treatment — `extend`/`refine` are required
   * there too). Schema and built Fabricator already share `[Kind]`/
   * `[Meta]`, so reading `[Meta]` off whichever `$Schema` is works for
   * both.
   */
  $Schema extends Primitive.object.Core<infer $Definition>
    ? TObject<{ [$K in keyof $Definition]: ToTypeBox<$Definition[$K]> }> :

  $Schema extends Primitive.array.Core<infer $Element>
    ? TArray<ToTypeBox<$Element>> :

  /**
   * TypeBox's `TRecordOrObject<K, V>` — exactly what `Type.Record`
   * returns — rather than a hand-rolled mapping, the same move
   * `ChoiceOptions` makes by deferring to `Union<T>`. Keeps
   * `TRecord<TString, V>` for an open string key; collapses a
   * literal-union or enum key into a `TObject` of those properties.
   *
   * A *symbol* key resolves to `TNever`: `TRecordOrObject` has no
   * `TSymbol` branch. Honest — `Static<TNever>` is `never`, agreeing
   * with "this cannot cross the wire" — and runtime `convert()` throws
   * rather than emitting the equivalent silently. See its `record` case.
   */
  $Schema extends Primitive.record.Core<infer $Key, infer $Value>
    ? TRecordOrObject<ToTypeBox<$Key>, ToTypeBox<$Value>> :

  /**
   * `Type.Recursive((This) => body)` already builds a `$ref`-based
   * schema whose validation recurses however deep a value goes —
   * including a terminal-shaped leaf (ordinary instance of the same
   * shape, self-referencing fields empty/absent). `terminal` needs no
   * separate mapping; only `$Body` matters. Wherever `self.Core` sits
   * nested (through however many `array`/`object`/etc. layers), the
   * `self` branch below resolves it to `TThis`, mirroring
   * `Fabricator.ts`'s runtime context-threading — `this["bindings"][0]`
   * there, `This`/`this["params"][0]` here.
   */
  $Schema extends Primitive.recursive.Core<infer $Body>
    ? TRecursive<ToTypeBox<$Body>> :

  $Schema extends Primitive.recursive.self.Core
    ? TThis :

  $Schema extends Primitive.tuple.Core<infer $Items>
    ? TTuple<TupleItems<$Items>> :

  $Schema extends Primitive.object.compute.Core<any, infer $Source>
    ? ToTypeBox<Primitive.object.compute.Denoted<$Source>> :

  $Schema extends Primitive.object.omittable.Core<infer $Inner>
    ? TOptional<ToTypeBox<$Inner>> :

  $Schema extends Primitive.object.optional.Core<infer $Inner>
    ? TOptional<TUnion<[ToTypeBox<$Inner>, TUndefined]>> :

  $Schema extends Primitive.always.Core<infer $Value>
    ? ToConst<$Value> :

  /**
   * An opaque value is whatever its producer returns — nothing for
   * the adapter to constrain. `TUnknown` says that; a lossy guess
   * would not. `Static<...>` is `unknown` while `ValueOf<...>` is the
   * producer's return type; that divergence widens rather than
   * conflicts, so it is safe. `.adapt(typebox, ...)` is how a caller
   * says more.
   */
  $Schema extends Primitive.opaque.Core
    ? TUnknown :

  $Schema extends Primitive.bigint.Core
    ? TBigInt :

  $Schema extends Primitive.boolean.Core
    ? TBoolean :

  /**
   * `EnumOptions` turns `[Meta].items` — a real tuple of
   * `[weight, item]` pairs, arity intact — into a same-length
   * tuple of each member's `ToConst<...>`. Handed to TypeBox's
   * `Union<T>` exactly as the `choice` branch below does, so it
   * resolves to the `TUnion<[...]>` the runtime emits (bare, no
   * wrapper, for a single member).
   */
  $Schema extends Primitive.enum.Core<infer $Items>
    ? Union<EnumOptions<$Items>> :

  /**
   * `ChoiceOptions` turns `[Meta].items` — a real tuple of
   * `[weight, option]` pairs, arity intact — into a same-length
   * tuple of each option's `ToTypeBox<...>`. Handed to TypeBox's
   * `Union<T>` (not our `TUnion` interface) so its collapse rule
   * applies: one option resolves to that option's mapped type with
   * no wrapper, matching `Type.Union` at runtime; two or more
   * resolve to a real `TUnion<T>`.
   */
  $Schema extends Primitive.choice.Core<infer $Items>
    ? Union<ChoiceOptions<$Items>> :

  $Schema extends Primitive.date.Core
    ? TDate :

  $Schema extends Primitive.number.Core<infer $Meta>
    ? $Meta extends { integer: true } ? TInteger : TNumber :

  $Schema extends Primitive.string.Core
    ? TString :

  $Schema extends Primitive.symbol.Core
    ? TSymbol :

  $Schema extends Primitive.undefined.Core
    ? TUndefined :

  $Schema extends Primitive.undefinable.Core<infer $Inner>
    ? TUnion<[ToTypeBox<$Inner>, TUndefined]> :

  $Schema extends Primitive.null.Core
    ? TNull :

  $Schema extends Primitive.nullable.Core<infer $Inner>
    ? TUnion<[ToTypeBox<$Inner>, TNull]> :

  $Schema extends Primitive.nullish.Core<infer $Inner>
    ? TUnion<[ToTypeBox<$Inner>, TNull, TUndefined]> :

  TSchema;

/**
 * Build a TypeBox schema from a Schema (or an already-built Fabricator —
 * `convert` only reads `[Kind]`/`[Meta]`, never `fabricate`, so either
 * works). The result is a real TypeBox schema — `Static`, `Value.Check`,
 * and `TypeCompiler` all work — typed identically to the equivalent
 * hand-written `Type.*` schema (see {@link ToTypeBox}).
 */
export function toTypeBox<const $Schema extends Buildable>(
  schema: $Schema,
): ToTypeBox<$Schema> {
  return drive(typebox, schema, {}) as ToTypeBox<$Schema>;
}

/**
 * This adapter as a value — what `schema.adapt(typebox, ...)` takes, and
 * what {@link toTypeBox} drives the walk with. The only two surfaces a
 * caller needs: one to attach an adaptation, one to convert.
 *
 * Naming `Key` as the parameter is what keeps `key`'s literal type, which
 * `.adapt(...)` reads off this value; `ReturnType<$Adapter["convert"]>`
 * is what it checks the adaptation's return against — `Returnable` is
 * `TSchema`, so a producer that hands back anything else fails at the
 * call site.
 */
export const typebox: Adapter<Key, BuildContext, Returnable> = { key, convert };

/**
 * Threaded through the recursion while walking beneath a `T.recursive`
 * schema's `body` — every other branch forwards it unchanged, so it
 * reaches however deeply a `self` node sits nested. Mirrors
 * `Constructor.ts`'s `ConstructionContext`, but only carries `This`:
 * `Type.Recursive` already gives back the placeholder to bind, so
 * there's no equivalent of the runtime stream-isolation problem —
 * building a TypeBox schema draws no randomness.
 */
type BuildContext = { self?: Returnable };

/**
 * Untyped per-kind dispatch. Switches on the runtime `[Kind]` tag;
 * precise typing lives on {@link toTypeBox} and {@link ToTypeBox}.
 *
 * Recurses through `recurse` rather than calling itself, so every
 * nested node passes back through the adaptation lookup in
 * `Adapter/Core.ts`'s `drive` — an `object` field, `array` element, or
 * `choice` option is adapted exactly as the root is. Nothing here
 * reads `[Adaptation]`; by the time a schema reaches this switch,
 * `drive` has already established it carries no adaptation for this
 * adapter.
 */
function convert(
  schema: any,
  recurse: Recurse<BuildContext, Returnable>,
  context: BuildContext,
): Returnable {
  switch (schema[Kind]) {
    case "object": {
      const s = schema as Primitive.object.Schema;
      const definition = s[Meta].definition;
      const properties: Record<string, Returnable> = {};
      for (const [key, child] of Object.entries(definition)) {
        properties[key] = recurse(child, context);
      }
      return Type.Object(properties);
    }

    case "array": {
      const s = schema as Primitive.array.Schema;
      const length = s[Meta].whereby?.length;
      const items = recurse(s[Meta].definition, context);
      if (!length) return Type.Array(items);
      const range = effectiveDiscrete(length.min, length.max);
      return Type.Array(items, { minItems: range.min, maxItems: range.max });
    }

    /**
     * `Type.Record` answers an unrepresentable key by returning `TNever`
     * (`{"not":{}}`) rather than raising — a schema *nothing* validates
     * against, produced silently. A symbol key is the case that arises
     * (`TRecordOrObject` has no `TSymbol` branch), but testing the
     * *result* for `Never` catches every such key shape, and stays
     * correct if TypeBox adds or removes a branch.
     *
     * `.adapt(typebox, ...)` wins over this mapping entirely.
     */
    case "record": {
      const s = schema as Primitive.record.Schema;
      const key = s[Meta].key;
      const mapped = Type.Record(
        recurse(key, context),
        recurse(s[Meta].value, context),
      );

      if (mapped[TypeBoxKind] === "Never") {
        throw new FabricatorError.UnrepresentableRecordKeyError(
          String(key[Kind]),
        );
      }

      return mapped;
    }

    /**
     * `Type.Recursive` already builds a `$ref`-based schema whose
     * validation recurses however deep a value goes — a terminal-shaped
     * leaf is an ordinary instance of the same shape with
     * self-referencing fields empty/absent — so `[Meta].terminal` is
     * never separately built; only `body` matters. `This` is bound
     * fresh for this call, so a `self` nested inside `body` resolves to
     * *this* recursion, not the caller's — mirrors `case "recursive"`
     * in `Constructor.ts`'s `make`.
     */
    case "recursive": {
      const s = schema as Primitive.recursive.Schema;
      return Type.Recursive((This) => recurse(s[Meta].body, { self: This }));
    }

    /**
     * Resolves against whichever `T.recursive` is currently building,
     * via `context.self` — runtime mirror of `Fabricator.ts`'s
     * `context.self` callback, except there is nothing to *call*:
     * `This` already *is* the schema. Absent `context.self`, `self` was
     * used with no active recursion — see `Constructor.ts`'s identical
     * `case "recursive.self"`; only reachable by misuse.
     */
    case "recursive.self": {
      if (!context?.self) {
        throw new FabricatorError.DetachedSelfError("adaptation");
      }
      return context.self;
    }

    case "tuple": {
      const s = schema as Primitive.tuple.Schema;
      return Type.Tuple(s[Meta].items.map((item) => recurse(item, context)));
    }

    /**
     * A computed key resolves to its source's schema; the resolver that
     * produces the value is irrelevant to the shape.
     */
    case "object.compute": {
      const s = schema as Primitive.object.compute.Schema<any, any>;
      return recurse(s[Meta].source, context);
    }

    case "object.omittable": {
      const s = schema as Primitive.object.omittable.Schema;
      return Type.Optional(recurse(s[Meta].definition, context));
    }
    case "object.optional": {
      const s = schema as Primitive.object.optional.Schema;
      return Type.Optional(
        Type.Union([recurse(s[Meta].definition, context), Type.Undefined()]),
      );
    }

    case "always": {
      const s = schema as Primitive.always.Schema;
      return toConst(s[Meta].value);
    }

    /**
     * Deliberately `Unknown`, not a throw — the opposite call to
     * `record`'s symbol key, and they differ for a reason. There,
     * `Type.Record` *silently* returns a `TNever` nothing could
     * satisfy, so failing loudly is strictly better. Here `Unknown` is
     * accurate: the adapter cannot constrain the value, and throwing
     * would make `toTypeBox` fail on any schema merely *containing* an
     * opaque field — defeating the escape hatch.
     */
    case "opaque":
      return Type.Unknown();

    case "bigint": {
      const s = schema as Primitive.bigint.Schema;
      const whereby = s[Meta].whereby;
      return Type.BigInt(
        whereby
          ? {
              ...numericBound(whereby.min, "minimum", "exclusiveMinimum"),
              ...numericBound(whereby.max, "maximum", "exclusiveMaximum"),
            }
          : undefined,
      );
    }
    case "boolean":
      return Type.Boolean();

    /**
     * Members are values, not schemas (that is `choice`, below), so
     * each maps through `toConst` rather than recursing into `build`.
     * Two members whose values share a schema shape — two distinct
     * symbols, say — produce duplicate union branches; harmless, not
     * worth deduplicating.
     */
    case "enum": {
      const s = schema as Primitive.enum.Schema;
      return Type.Union(s[Meta].items.map(([, item]) => toConst(item)));
    }

    case "choice": {
      const s = schema as Primitive.choice.Schema;
      return Type.Union(
        s[Meta].items.map(([, item]) => recurse(item, context)),
      );
    }

    case "date": {
      const s = schema as Primitive.date.Schema;
      const whereby = s[Meta].whereby;
      if (!whereby?.min && !whereby?.max) return Type.Date();
      return Type.Date({
        ...(whereby.min
          ? timestampBound(
              whereby.min,
              "minimumTimestamp",
              "exclusiveMinimumTimestamp",
            )
          : {}),
        ...(whereby.max
          ? timestampBound(
              whereby.max,
              "maximumTimestamp",
              "exclusiveMaximumTimestamp",
            )
          : {}),
      });
    }

    /**
     * `[Meta].hints` holds orthogonal JSON-Schema keywords; range Bound
     * lives on `whereby` and is forwarded as `minimum`/`exclusiveMinimum`
     * (and the integer/string length equivalents). `integer` picks
     * `Type.Integer()` over `Type.Number()` to match {@link ToTypeBox}
     * reading the same flag off `$Meta`. The static type of `string` is
     * `TString` regardless of which options are present.
     */
    case "number": {
      const s = schema as Primitive.number.Schema;
      const meta = s[Meta];
      const whereby = meta?.whereby;
      const options = {
        ...meta?.hints,
        ...(whereby
          ? {
              ...numericBound(whereby.min, "minimum", "exclusiveMinimum"),
              ...numericBound(whereby.max, "maximum", "exclusiveMaximum"),
            }
          : {}),
      };
      return meta?.integer ? Type.Integer(options) : Type.Number(options);
    }
    case "string": {
      const s = schema as Primitive.string.Schema;
      const meta = s[Meta];
      const length = meta?.whereby?.length;
      const range = length
        ? effectiveDiscrete(length.min, length.max)
        : undefined;
      return Type.String({
        ...meta?.hints,
        ...(range ? { minLength: range.min, maxLength: range.max } : {}),
      });
    }

    case "symbol":
      return Type.Symbol();
    case "undefined":
      return Type.Undefined();
    case "undefinable": {
      const s = schema as Primitive.undefinable.Schema;
      return Type.Union([
        recurse(s[Meta].definition, context),
        Type.Undefined(),
      ]);
    }

    case "null":
      return Type.Null();
    case "nullable": {
      const s = schema as Primitive.nullable.Schema;
      return Type.Union([recurse(s[Meta].definition, context), Type.Null()]);
    }
    case "nullish": {
      const s = schema as Primitive.nullish.Schema;
      return Type.Union([
        recurse(s[Meta].definition, context),
        Type.Null(),
        Type.Undefined(),
      ]);
    }

    default:
      throw new FabricatorError.UnknownKindError(
        String(schema[Kind]),
        "adaptation",
      );
  }
}

/**
 * Stated Bound → TypeBox draft-7 numeric keywords. Inclusive uses
 * `minimum`/`maximum`; exclusive uses `exclusiveMinimum`/`exclusiveMaximum`
 * with the stated value, not the discrete interior — validation language
 * matches fabrication's exclusive end. Length has no exclusive keyword and
 * goes through {@link effectiveDiscrete} at the call site instead.
 */
function numericBound<$Value extends number | bigint>(
  bound: Bound<$Value> | undefined,
  inclusive: "minimum" | "maximum",
  exclusive: "exclusiveMinimum" | "exclusiveMaximum",
): { [key: string]: $Value } {
  if (!bound) return {};
  return bound.exclusive
    ? { [exclusive]: bound.value }
    : { [inclusive]: bound.value };
}

function timestampBound(
  bound: Bound<Date>,
  inclusive: "minimumTimestamp" | "maximumTimestamp",
  exclusive: "exclusiveMinimumTimestamp" | "exclusiveMaximumTimestamp",
): { [key: string]: number } {
  const value = bound.value.getTime();
  return bound.exclusive ? { [exclusive]: value } : { [inclusive]: value };
}

/**
 * TypeBox schema for one fixed JS value — the runtime half of
 * {@link ToConst}. Neither `always` nor `enum` needs to reject
 * anything.
 *
 * Not a bare `Type.Const(value)` call, though it falls back to one.
 * `Type.Const` picks the right TypeBox type but stops there, so
 * `Type.Const(5n)` is a bare `TBigInt` that accepts any bigint — far
 * looser than what an `always` produces. Where TypeBox has an option
 * bag that can pin the value, this uses it: `minimum`/`maximum` for a
 * bigint, `minimumTimestamp`/`maximumTimestamp` for a date,
 * `min`/`maxByteLength` for a Uint8Array. Options are runtime only and
 * never reach `Static<>`, which is why {@link ToConst} stays a plain
 * `TConst` while this side is strictly more precise.
 *
 * Two values still cannot be pinned; `.adapt(typebox, ...)` is the
 * escape hatch for both: a `symbol` (`Symbol(options?)` takes no value
 * constraint) and a `Uint8Array`'s *contents* (only byte length is
 * expressible).
 *
 * Plain objects and arrays recurse here rather than being handed
 * wholesale to `Type.Const`, so a pinnable value nested inside one
 * gets pinned too — otherwise `T.always({ at: new Date(0) })` would
 * pin nothing while `T.always(new Date(0))` pinned exactly. The
 * recursion mirrors `TConst`'s readonly marking (properties and array
 * elements wrapped in `Type.Readonly`, the top level left bare) so the
 * result stays assignable to {@link ToConst}; `T.always(...)`'s
 * `const` type parameter infers readonly members to match.
 */
function toConst(value: unknown): TSchema {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return Type.Literal(value);
    case "bigint":
      return Type.BigInt({ minimum: value, maximum: value });
    case "undefined":
      return Type.Undefined();
  }

  if (value === null) return Type.Null();

  if (value instanceof Date) {
    const timestamp = value.valueOf();
    return Type.Date({
      minimumTimestamp: timestamp,
      maximumTimestamp: timestamp,
    });
  }

  if (value instanceof Uint8Array)
    return Type.Uint8Array({
      minByteLength: value.byteLength,
      maxByteLength: value.byteLength,
    });

  if (Array.isArray(value))
    return Type.Readonly(
      Type.Tuple(value.map((v) => Type.Readonly(toConst(v)))),
    );

  if (isPlainObject(value))
    return Type.Object(
      Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, Type.Readonly(toConst(v))]),
      ),
    );

  /**
   * Symbols, functions, iterators, class instances — everything with no
   * pinnable option bag. `Type.Const` already dispatches these correctly
   * (and is total, falling back to `Type.Object({})`), so there is nothing
   * to add on top.
   */
  return Type.Const(value);
}
