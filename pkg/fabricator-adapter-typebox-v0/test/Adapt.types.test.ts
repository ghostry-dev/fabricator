import {
  Type,
  type TInteger,
  type TObject,
  type TOptional,
  type TString,
  type TUndefined,
  type TUnion,
} from "@sinclair/typebox";
import { expect, test } from "bun:test";
import {
  initialize,
  Adaptation,
  registry,
  type Adapter,
} from "@ghostry/fabricator";
import {
  toTypeBox,
  typebox,
  type ToTypeBox,
} from "@ghostry/fabricator-adapter-typebox-v0";

/**
 * Compile-time assertions — see `Fabrication.types.test.ts` for why `Equal`/
 * `Expect` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;

const { T, Fabricator } = initialize({ types: registry });

/**
 * An adapter for a library this repo ships nothing for, standing in for a
 * third party's. `toTypeBox` must carry its entries and ignore them.
 *
 * A whole adapter rather than a bare key because that is now the only way to
 * put an entry on a schema — and it is what makes this a real test of
 * isolation rather than of a cast: `zod`'s adaptations are filed under a key
 * `zod` itself owns, so nothing about them is assignable to, or confusable
 * with, `typebox`'s. Registering it anywhere is neither needed nor possible;
 * an adapter is a value.
 *
 * `convert` returns `string` — a deliberately non-TypeBox external type, so
 * that an adaptation for this adapter is exactly what `ToTypeBox`'s
 * `infer ... extends TSchema` guard has to refuse.
 */
const zod = {
  key: "test/zod",
  convert: (): string => "z.unknown()",
} as const satisfies Adapter<"test/zod", unknown, string>;

/**
 * A hand-written `[Adaptation]` map carrying only the foreign adapter's entry.
 * Built as a type rather than through `.adapt(zod, ...)` so it asserts against
 * the runtime shape directly, independent of what `.adapt` happens to infer.
 */
type CarryingForeignOnly = typeof T.number.integer & {
  readonly [Adaptation]: { "test/zod": (schema: any) => string };
};

/* -------------------------------------------------------------------------- */
/*  An adaptation replaces its kind's own mapping — the whole point: no        */
/*  native kind says "a string that is an email", and `T.date` maps to         */
/*  `Type.Date()`, which is not what a JSON transport wants.                  */
/* -------------------------------------------------------------------------- */

/**
 * Deriving the external schema from the kind's own config is the case
 * `Adapting`'s `meta` exists for — reachable with nothing imported from
 * `@ghostry/fabricator/internal`, which is what keeps a well-known symbol off
 * the path an ordinary caller has to walk.
 */
const email = T.string
  .whereby({ length: { max: 32 } })
  .adapt(typebox, ({ meta }) =>
    Type.String({ format: "email", maxLength: meta.whereby.length.max.value }),
  );
const adaptedString = toTypeBox(email);

const timestamp = T.date.adapt(typebox, () =>
  Type.String({ format: "date-time" }),
);
const adaptedDate = toTypeBox(timestamp);

/** The same schema, built first — the `Constructor.ts` re-attach. */
const builtString = toTypeBox(new Fabricator(email));

/** Chaining must not drop it, at either level. */
const chained = toTypeBox(email.as(() => "someone@example.com"));

/** Nested, where the adapter walks a `toSchema`-normalized entry. */
const inObject = toTypeBox(T.object({ email }));
const inArray = toTypeBox(T.array(email).whereby({ length: 3 }));
const inOmittable = toTypeBox(T.object({ email: T.omittable(email) }));

/** An `object` carries its map through `extend`/`refine`/`override`. */
const record = T.object({ x: T.number.integer }).adapt(typebox, () =>
  Type.Object({ known: Type.String() }),
);
const adaptedObject = toTypeBox(record);
const extended = toTypeBox(record.extend(() => ({ y: T.number.integer })));
const overridden = toTypeBox(record.override({ x: 7 }));

/**
 * Layering: an adaptation that adapts its own argument resolves to whatever
 * it replaced — the previous adaptation here, the kind's ordinary mapping
 * below.
 */
const layered = toTypeBox(
  email.adapt(typebox, ({ schema }) =>
    Type.String({ ...toTypeBox(schema), minLength: 3 }),
  ),
);
const overDefault = toTypeBox(
  T.string
    .whereby({ length: { max: 8 } })
    .adapt(typebox, ({ schema }) => Type.String({ ...toTypeBox(schema) })),
);

/** A `zod`-only adaptation must fall through to the native mapping. */
const zodOnly = T.number.integer.adapt(zod, () => "z.number().int()");
const bothLibraries = zodOnly.adapt(typebox, () => Type.String());
const adaptedForZodOnly = toTypeBox(zodOnly);
const adaptedForBoth = toTypeBox(bothLibraries);
const unadapted = toTypeBox(T.undefinable(T.number.integer));

/* -------------------------------------------------------------------------- */
/*  Passing the adapter itself is what lets `.adapt` check the adaptation      */
/*  against that adapter's own external type, here rather than silently at     */
/*  conversion time. Compile-time only — there is nothing to run.              */
/* -------------------------------------------------------------------------- */

const bounded = T.string.whereby({ length: { max: 4 } });

/** @ts-expect-error - a plain object is not a `TSchema` */
bounded.adapt(typebox, () => ({ type: "string" }));

/** @ts-expect-error - `zod`'s external type is `string`, not a `TSchema` */
T.number.integer.adapt(zod, () => Type.Integer());

/** @ts-expect-error - an adapter is a value; a bare key names nothing */
T.number.integer.adapt("test/zod", () => "z.number()");

/**
 * A computed field ordinarily maps via the `source` it derives its shape
 * from; adapting the field itself is how the two are told apart. Adapted to
 * an integer deliberately, so this diverges from what the `T.string` source
 * would have produced — an adaptation returning `TString` here would assert
 * nothing.
 */
const computed = T.object({
  name: T.string.whereby({ length: { max: 4 } }),
}).refine(({ compute }) => ({
  slug: compute(T.string).as(({ fabricated }) => fabricated.name.toLowerCase()),
}));
const adaptedComputed = T.object({
  name: T.string.whereby({ length: { max: 4 } }),
}).refine(({ compute }) => ({
  slug: compute(T.string)
    .as(({ fabricated }) => fabricated.name.toLowerCase())
    .adapt(typebox, () => Type.Integer({ minimum: 1 })),
}));
const inCompute = toTypeBox(computed);
const inAdaptedCompute = toTypeBox(adaptedComputed);

/**
 * The producer's parameter as a caller actually receives it — read back off
 * a real `.adapt(...)`, so it tracks whatever that method declares rather
 * than restating `Adapting` and asserting against itself.
 */
type AdaptingOf<$Schema extends { adapt: (...args: never) => unknown }> =
  Parameters<$Schema["adapt"]>[1] extends (adapting: infer $Adapting) => unknown
    ? $Adapting
    : never;

export type Assertions = [
  /**
   * `meta` resolves to the kind's own config rather than `unknown` — implicit
   * in `email`'s producer reading `meta.whereby.length.max.value` above (which would
   * not compile otherwise), stated here so a regression to `unknown` fails as
   * an assertion rather than as a property access somewhere unrelated.
   */
  Expect<
    Equal<
      AdaptingOf<typeof email>["meta"] extends { whereby: unknown }
        ? true
        : false,
      true
    >
  >,
  Expect<Equal<typeof adaptedString, TString>>,
  Expect<Equal<typeof adaptedDate, TString>>,
  Expect<Equal<typeof builtString, TString>>,
  Expect<Equal<typeof chained, TString>>,
  Expect<Equal<typeof inObject, TObject<{ readonly email: TString }>>>,
  Expect<Equal<typeof inArray, ReturnType<typeof Type.Array<TString>>>>,
  Expect<
    Equal<typeof inOmittable, TObject<{ readonly email: TOptional<TString> }>>
  >,
  Expect<Equal<typeof adaptedObject, TObject<{ known: TString }>>>,
  Expect<Equal<typeof extended, TObject<{ known: TString }>>>,
  Expect<Equal<typeof overridden, TObject<{ known: TString }>>>,
  Expect<Equal<typeof layered, TString>>,
  Expect<Equal<typeof overDefault, TString>>,
  /**
   * Falls through the adaptation branch, so still precisely `TInteger`.
   * Each of the three covers a different way that has to hold: an entry under
   * another adapter's key only, the same via a hand-written map, and the two
   * adapters' entries coexisting on one schema without either reading the
   * other's.
   */
  Expect<Equal<typeof adaptedForZodOnly, TInteger>>,
  Expect<Equal<ToTypeBox<CarryingForeignOnly>, TInteger>>,
  Expect<Equal<typeof adaptedForBoth, TString>>,
  /**
   * An unadapted schema is untouched by any of this — the guard on the
   * optional-property `infer` hazard `AdaptationsOf` exists to avoid (see
   * `Adapter/Types.ts`). Every assertion in `index.types.test.ts` covers the
   * rest of the kinds the same way.
   */
  Expect<Equal<typeof unadapted, TUnion<[TInteger, TUndefined]>>>,
  Expect<
    Equal<
      typeof inCompute,
      TObject<{ readonly name: TString; readonly slug: TString }>
    >
  >,
  Expect<
    Equal<
      typeof inAdaptedCompute,
      TObject<{ readonly name: TString; readonly slug: TInteger }>
    >
  >,
];

test("an adaptation replaces its kind's own mapping", () => {
  expect(adaptedString.type).toBe("string");
  expect(adaptedString.format).toBe("email");
  expect(adaptedString.maxLength).toBe(32);
  expect(adaptedDate.format).toBe("date-time");
});

test("a built Fabricator carries its schema's adaptation", () => {
  expect(builtString.format).toBe("email");
  expect(new Fabricator(email).fabricate()).toBeString();
});

test("a built Fabricator's own `.schema` round-trips it", () => {
  expect(toTypeBox(new Fabricator(email).schema).format).toBe("email");
  expect(
    toTypeBox(new Fabricator(record).schema).properties.known,
  ).toBeDefined();
});

test("chaining a builder method keeps the adaptation", () => {
  expect(chained.format).toBe("email");
  expect(toTypeBox(email.adapt(zod, () => "z.string()")).format).toBe("email");
});

test("an `object` keeps its adaptation through extend/refine/override", () => {
  expect(adaptedObject.properties.known.type).toBe("string");
  expect(extended.properties.known.type).toBe("string");
  expect(overridden.properties.known.type).toBe("string");
  expect(
    toTypeBox(
      record.refine(({ compute }) => ({
        y: compute(T.number.integer).as(({ fabricated }) => fabricated.x + 1),
      })),
    ).properties.known.type,
  ).toBe("string");
});

test("a nested adapted field is adapted wherever it sits", () => {
  expect(inObject.properties.email.format).toBe("email");
  expect(inArray.items.format).toBe("email");
  expect(inOmittable.properties.email.format).toBe("email");
  expect(inOmittable.required).toBeUndefined();
});

test("an adapted computed field maps via its adaptation, not its source", () => {
  expect(inCompute.properties.slug.type).toBe("string");
  expect(inAdaptedCompute.properties.slug.type).toBe("integer");
  /** Built first, too — the compute branch of `AsFabricator`. */
  expect(toTypeBox(new Fabricator(adaptedComputed)).properties.slug.type).toBe(
    "integer",
  );

  /** And resolving the value is untouched by any of it. */
  const fabricated = new Fabricator(adaptedComputed).fabricate();
  expect(fabricated.slug).toBe(fabricated.name.toLowerCase());
});

test("a nested adapted `object` field survives `.override(...)`", () => {
  const outer = T.object({ inner: record }).override({ inner: { x: 1 } });
  expect(toTypeBox(outer).properties.inner.properties.known).toBeDefined();
});

test("an adaptation adapting its own argument resolves to what it replaced", () => {
  /** The inner `email` adaptation, plus this one's own `minLength`. */
  expect(layered.format).toBe("email");
  expect(layered.minLength).toBe(3);
  /** Nothing replaced, so the argument maps by kind: a plain string. */
  expect(overDefault.type).toBe("string");
  expect(overDefault.format).toBeUndefined();
});

test("an adaptation replaces only its own adapter's, never another's", () => {
  const readapted = email.adapt(typebox, () => Type.String({ format: "uri" }));
  expect(toTypeBox(readapted).format).toBe("uri");

  /**
   * Each entry filed under the key its own adapter owns — which is what makes
   * the two independent, rather than any agreement about naming.
   */
  const bothMaps = bothLibraries[Adaptation]!;
  expect(Object.keys(bothMaps).sort()).toEqual([typebox.key, zod.key].sort());
  expect(toTypeBox(zodOnly).type).toBe("integer");
});

test("`meta` is the schema's config, needing no well-known symbol", () => {
  /** The `email` adaptation above derives `maxLength` from its own `whereby`. */
  expect(adaptedString.maxLength).toBe(32);
});

test("`meta` is read where the adapter walks, not closed over at `.adapt`", () => {
  const probe = T.object({ x: T.number.integer }).adapt(typebox, ({ meta }) =>
    Type.Object(
      Object.fromEntries(
        Object.keys(meta.definition).map((field) => [field, Type.String()]),
      ),
    ),
  );

  /**
   * A builder method chained *after* `.adapt(...)` rewrites `[Meta]`, and the
   * adaptation has to see that rewrite — `toSchemaAdaptation` reads `meta` off
   * whichever schema `layer` hands down, rather than closing over the one
   * being adapted at the point `.adapt(...)` was called.
   */
  expect(Object.keys(toTypeBox(probe).properties)).toEqual(["x"]);
  expect(
    Object.keys(
      toTypeBox(probe.extend(() => ({ y: T.number.integer }))).properties,
    ),
  ).toEqual(["x", "y"]);
});

test("`Adaptation` is the public, registry-keyed symbol", () => {
  expect(Symbol.keyFor(Adaptation)).toBe("fabricator:adaptation");
  expect(email[Adaptation]).toBeDefined();
  expect(T.string.whereby({ length: { max: 4 } })[Adaptation]).toBeUndefined();
});

test("an adaptation receives the schema's own kind and meta when nested", () => {
  const seen: Array<unknown> = [];
  const probe = T.number.integer.adapt(typebox, ({ schema, meta }) => {
    seen.push([meta, (schema as { [Adaptation]?: unknown })[Adaptation]]);
    return Type.Integer();
  });

  toTypeBox(T.object({ n: probe }));
  expect(seen).toHaveLength(1);
  expect((seen[0] as Array<any>)[0].integer).toBe(true);
  /** Its own entry is gone — that is what makes `toTypeBox` re-entrant. */
  expect((seen[0] as Array<any>)[1]).toBeUndefined();
});
