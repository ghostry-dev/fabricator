import type { Faker } from "@faker-js/faker";
import { en } from "@faker-js/faker";
import {
  initialize,
  registry,
  type Fabrication,
  type ValueOf,
} from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";
import {
  fakerExtension,
  type FakerModules,
  type FakerTypes,
  type MethodName,
  type ModuleName,
} from "@ghostry/fabricator-extension-faker-v10";
import type {
  TArray,
  TBigInt,
  TBoolean,
  TDate,
  TLiteral,
  TNumber,
  TObject,
  TString,
  TTuple,
  TUnion,
  TUnknown,
} from "@sinclair/typebox";
import { test } from "bun:test";

/**
 * Compile-time assertions — see `pkg/fabricator/test/Fabrication.types.test.ts`
 * for why `Equal`/`Expect` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type Expect<_ extends true> = true;

const { T, Fabricator } = initialize({
  types: registry.extend(fakerExtension({ locale: en })),
});

/**
 * The integration itself: `fakerExtension(...)` returns a `registry.extend`
 * callback, so its builders arrive as `T.faker.*` alongside every core kind
 * rather than through a separate namespace object a caller has to thread
 * around. A regression here — a builder reachable only off a standalone
 * factory's return value — would leave every runtime test passing.
 */
const built = new Fabricator(
  T.object({
    name: T.faker.person.fullName(),
    email: T.faker.internet.email(),
    joined: T.faker.date.past(),
    age: T.faker.number.int(),
    active: T.faker.datatype.boolean(),
    /** A core kind, to pin that extending did not displace the originals. */
    id: T.string.whereby({ length: { max: 8 } }),
    /**
     * `use`'s kind-tagged forms — each resolves to the value type the
     * callback itself declares, not `unknown`, since `.string`/`.number`
     * constrain `produce`'s own return type rather than merely tagging it
     * after the fact.
     */
    used: T.faker.use.string((f) => f.helpers.fromRegExp("[A-Z]{3}")),
    usedOpaque: T.faker.use.opaque((f) => f.helpers.arrayElement([1, 2, 3])),
  }),
);

type Built = Fabrication<typeof built>;

export type Assertions = [
  Expect<Equal<Built["name"], string>>,
  Expect<Equal<Built["email"], string>>,
  Expect<Equal<Built["joined"], Date>>,
  Expect<Equal<Built["age"], number>>,
  Expect<Equal<Built["active"], boolean>>,
  Expect<Equal<Built["id"], string>>,
  Expect<Equal<Built["used"], string>>,
  /**
   * `use.opaque`'s `$T` is inferred from `produce`'s own return type, so a
   * narrower callback (`arrayElement([1, 2, 3])`, a literal `1 | 2 | 3`)
   * keeps its exact literal union rather than widening to `number` — the
   * same inference `T.opaque` itself gives, per `CLAUDE.md`.
   */
  Expect<Equal<Built["usedOpaque"], 1 | 2 | 3>>,

  /**
   * Each builder forwards its faker method's own options, so a caller keeps
   * faker's argument surface rather than a re-declared approximation of it.
   */
  Expect<
    Equal<
      Parameters<typeof T.faker.number.int>[0],
      Parameters<
        (typeof import("@faker-js/faker"))["faker"]["number"]["int"]
      >[0]
    >
  >,
];

/**
 * Strips `readonly` one level deep. `object/Types.ts`'s `Fabricated` maps
 * over a *computed* key set (`Exclude<keyof $Definition, OmittableKeys<...>>`),
 * not `keyof $Definition` directly — a non-homomorphic mapped type, which
 * never carries a source property's modifiers forward. So a fabricated
 * object's properties are never `readonly`, regardless of the schema's own
 * field definitions, while faker declares some of its record shapes
 * (`Airline`, `Airplane`, `Airport`) with `readonly` fields and others
 * (`Currency`, `Language`, `ChemicalElement`, `Unit`) without. `Honest<...>`
 * cares whether the two sides can hold the same *values*, not whether one
 * of them promises not to reassign a property — mutability is a complete
 * non-issue for a data-generation library — so both sides are stripped
 * before comparing.
 */
type Mutable<$T> = $T extends object
  ? { -readonly [$K in keyof $T]: $T[$K] }
  : $T;

/**
 * `Honest<$M, $K>` — the enforcer that lets the mirror be hand-written at
 * all. There is no generator and no runtime probe; a human decides which
 * core kind each of faker's 237 methods maps to, and *this* is what makes a
 * wrong decision a compile error instead of a silent bug.
 *
 * For every module/method the mirror covers, it compares the *value* type
 * the declared builder resolves to
 * (`ValueOf<ReturnType<FakerModules[$M][$K]>>`) against faker's own declared
 * return type (`ReturnType<Faker[$M][$K]>`). That catches a method mapped to
 * the wrong kind, an object entry whose field shape is wrong, an enum
 * missing a member, and a faker release changing a return type — each
 * reported at the exact entry.
 *
 * It reads `FakerModules` — the shipped surface — rather than any
 * intermediate description of it, so what is asserted is precisely what
 * consumers get.
 *
 * `Faker[$M][$K] extends (...) => unknown ? ... : never` re-narrows the
 * indexed access to a callable before `ReturnType<>`: `$K` is only known to
 * be `MethodName<$M>`, an intersection of two independently-indexed
 * `keyof`s, which isn't enough for the compiler to prove the access is
 * callable.
 */
type Honest<$M extends ModuleName, $K extends MethodName<$M>> = Equal<
  FakerModules[$M][$K] extends (...args: never[]) => unknown
    ? Mutable<ValueOf<ReturnType<FakerModules[$M][$K]>>>
    : never,
  Faker[$M][$K] extends (...args: never[]) => unknown
    ? Mutable<ReturnType<Faker[$M][$K]>>
    : never
>;

type Values<$T> = $T[keyof $T];

/** Collapses a union of booleans to `true` only if every member is `true` —
 * so `Expect<AllTrue<...>>` fails to compile the moment any one method in a
 * module disagrees, without needing 237 individually named assertions. */
type AllTrue<$U extends boolean> = [$U] extends [true] ? true : false;

/**
 * The one deliberate deviation `Honest<...>` cannot express, carved out here
 * rather than papered over in the surface itself.
 *
 * `color`'s 7 split methods are each one faker method but *two* builders
 * (`{ text, channels }`), so the node is a plain object rather than a
 * callable and there is no single return type to compare — `ReturnType<...>`
 * would not even apply. Their correctness is pinned instead by
 * `TypeBoxAssertions` below (`text` → `TString`, `channels` →
 * `TArray<TNumber>`) and by `Deviation.test.ts` fabricating both halves.
 *
 * They remain covered by `MethodsExhaustive<$M>`, which checks that the
 * *keys* match faker's — only the return-type comparison is skipped. See the
 * deviation policy in `CLAUDE.md`'s "The faker extension".
 *
 * Nothing else is exempt, `location.nearbyGPSCoordinate` included: the
 * mirror gives it `T.tuple([T.number, T.number])`, matching faker's declared
 * `[latitude, longitude]` arity exactly, so `Honest<...>` covers it like any
 * other method.
 */
type ColorSplitMethod =
  "rgb" | "cmyk" | "hsl" | "hwb" | "lab" | "lch" | "colorByCSSColorSpace";

type CheckedMethodName<$M extends ModuleName> = $M extends "color"
  ? Exclude<MethodName<$M>, ColorSplitMethod>
  : MethodName<$M>;

type ModuleHonest<$M extends ModuleName> = AllTrue<
  Values<{ [$K in CheckedMethodName<$M>]: Honest<$M, $K & MethodName<$M>> }>
>;

/**
 * One assertion per module — narrower than one per method, but a failure
 * still names the module to bisect into, and 26 hand-written lines stays
 * legible where 237 would not.
 */
export type HonestAssertions = [
  Expect<ModuleHonest<"airline">>,
  Expect<ModuleHonest<"animal">>,
  Expect<ModuleHonest<"book">>,
  Expect<ModuleHonest<"color">>,
  Expect<ModuleHonest<"commerce">>,
  Expect<ModuleHonest<"company">>,
  Expect<ModuleHonest<"database">>,
  Expect<ModuleHonest<"datatype">>,
  Expect<ModuleHonest<"date">>,
  Expect<ModuleHonest<"finance">>,
  Expect<ModuleHonest<"food">>,
  Expect<ModuleHonest<"git">>,
  Expect<ModuleHonest<"hacker">>,
  Expect<ModuleHonest<"image">>,
  Expect<ModuleHonest<"internet">>,
  Expect<ModuleHonest<"location">>,
  Expect<ModuleHonest<"lorem">>,
  Expect<ModuleHonest<"music">>,
  Expect<ModuleHonest<"number">>,
  Expect<ModuleHonest<"person">>,
  Expect<ModuleHonest<"phone">>,
  Expect<ModuleHonest<"science">>,
  Expect<ModuleHonest<"string">>,
  Expect<ModuleHonest<"system">>,
  Expect<ModuleHonest<"vehicle">>,
  Expect<ModuleHonest<"word">>,
];

/**
 * Module exhaustiveness, checked against **faker's own member list** rather
 * than a hand-kept roster of names. A hand-kept list can only ever confirm
 * that the mirror matches itself; this fails when faker adds or removes a
 * module, which is the drift that actually matters.
 *
 * Every exclusion is a deliberate deviation and is named. `helpers` is
 * faker's utility belt, omitted because core already expresses all of it and
 * better (`arrayElement` is `T.enum.uniform`, `maybe` is
 * `T.optional`/`T.omittable`, and so on — see the deviation policy in
 * `CLAUDE.md`'s "The faker extension"); reach it through `T.faker.use.*`.
 * The rest are not data-generating modules at all — two definition bags, and
 * four members describing the instance itself rather than producing values
 * from it (`getMetadata()` reports the resolved locale, `seed()` reseeds
 * faker's own randomizer, which this package deliberately never uses).
 */
type NotAModule =
  | "helpers"
  | "definitions"
  | "rawDefinitions"
  | "defaultRefDate"
  | "setDefaultRefDate"
  | "getMetadata"
  | "seed";

export type _ModulesExhaustive = Expect<
  Equal<keyof FakerModules, Exclude<keyof Faker, NotAModule>>
>;

/**
 * Method exhaustiveness, per module — the guard that catches a method added
 * to an existing faker module, the one drift surface no return-type check
 * can see (a method the mirror simply doesn't have has no entry to compare).
 *
 * Both of faker's module base classes declare their `faker` back-reference
 * as `protected`, so `keyof Faker[$M]` is exactly the public method set and
 * needs no exclusions of its own. `color` is equal too, despite its 7 split
 * nodes: a split occupies the same key faker declares, just with a
 * `{ text, channels }` object rather than a function behind it.
 *
 * `Equal` rather than a one-directional `extends`, so an upstream *removal*
 * fails just as loudly as an addition — a builder left behind after faker
 * drops a method would otherwise call a function that no longer exists.
 */
type MethodsExhaustive<$M extends ModuleName> = Equal<
  keyof FakerModules[$M],
  keyof Faker[$M]
>;

export type MethodExhaustivenessAssertions = [
  Expect<MethodsExhaustive<"airline">>,
  Expect<MethodsExhaustive<"animal">>,
  Expect<MethodsExhaustive<"book">>,
  Expect<MethodsExhaustive<"color">>,
  Expect<MethodsExhaustive<"commerce">>,
  Expect<MethodsExhaustive<"company">>,
  Expect<MethodsExhaustive<"database">>,
  Expect<MethodsExhaustive<"datatype">>,
  Expect<MethodsExhaustive<"date">>,
  Expect<MethodsExhaustive<"finance">>,
  Expect<MethodsExhaustive<"food">>,
  Expect<MethodsExhaustive<"git">>,
  Expect<MethodsExhaustive<"hacker">>,
  Expect<MethodsExhaustive<"image">>,
  Expect<MethodsExhaustive<"internet">>,
  Expect<MethodsExhaustive<"location">>,
  Expect<MethodsExhaustive<"lorem">>,
  Expect<MethodsExhaustive<"music">>,
  Expect<MethodsExhaustive<"number">>,
  Expect<MethodsExhaustive<"person">>,
  Expect<MethodsExhaustive<"phone">>,
  Expect<MethodsExhaustive<"science">>,
  Expect<MethodsExhaustive<"string">>,
  Expect<MethodsExhaustive<"system">>,
  Expect<MethodsExhaustive<"vehicle">>,
  Expect<MethodsExhaustive<"word">>,
];

/**
 * `use` shares a key space with the real faker module names on
 * `FakerExtension` — this is the guard that it never silently becomes one
 * (a faker release adding a module literally named `use`, however
 * unlikely) without a compile error surfacing here. `Deviation.test.ts`'s
 * runtime test checks `use`'s own shape; this checks the collision
 * specifically.
 */
export type _UseIsNotAModuleName = Expect<
  "use" extends ModuleName ? false : true
>;

/**
 * `FakerExtension` is `FakerModules` plus `use`, so this asserts the two
 * halves compose to exactly what `T.faker` exposes — no module lost to the
 * intersection, and nothing extra smuggled in alongside `use`.
 */
export type _ExtensionCoversEveryModule = Expect<
  Equal<Exclude<keyof FakerTypes, "use">, ModuleName>
>;

/**
 * The type-level half of `Adapter.test.ts`: every kind branch of the mirror
 * converts to precisely the TypeBox counterpart it should — not merely to
 * something assignable to it, and not to a loose `TSchema`. This is the
 * "adapter-compatible" promise stated as a type.
 *
 * Asserted with `Equal<...>` against an *inferred* local, never by annotating
 * the local (`const s: TString = toTypeBox(...)`). The annotation form forces
 * a structural assignability walk between `ToTypeBox<...>` and a recursive
 * TypeBox interface, and one such check exceeds TypeScript 5's
 * 5,000,000-instantiation budget by itself — see `Adapter.test.ts`'s header.
 * `Equal`'s identity comparison avoids that walk, and pins the type more
 * precisely besides.
 */
const asString = toTypeBox(T.faker.person.fullName());
const asDate = toTypeBox(T.faker.date.past());
const asNumber = toTypeBox(T.faker.number.int());
const asBoolean = toTypeBox(T.faker.datatype.boolean());
const asBigint = toTypeBox(T.faker.number.bigInt());
const asEnum = toTypeBox(T.faker.person.sexType());
const asTuple = toTypeBox(T.faker.location.nearbyGPSCoordinate());
const asDateArray = toTypeBox(
  T.faker.date.betweens({ from: "2020-01-01", to: "2021-01-01" }),
);
const asObject = toTypeBox(T.faker.airline.airport());
const asColourText = toTypeBox(T.faker.color.rgb.text());
const asColourChannels = toTypeBox(T.faker.color.rgb.channels());
const asUseString = toTypeBox(T.faker.use.string((f) => f.string.uuid()));
const asUseOpaque = toTypeBox(T.faker.use.opaque(() => new Map()));

export type TypeBoxAssertions = [
  Expect<Equal<typeof asString, TString>>,
  Expect<Equal<typeof asDate, TDate>>,
  Expect<Equal<typeof asNumber, TNumber>>,
  Expect<Equal<typeof asBoolean, TBoolean>>,
  Expect<Equal<typeof asBigint, TBigInt>>,

  /** An enum keeps its exact member set, in declaration order. */
  Expect<
    Equal<
      typeof asEnum,
      TUnion<[TLiteral<"female">, TLiteral<"generic">, TLiteral<"male">]>
    >
  >,

  Expect<Equal<typeof asTuple, TTuple<[TNumber, TNumber]>>>,
  Expect<Equal<typeof asDateArray, TArray<TDate>>>,

  /** A record shape keeps its exact properties, not a bare `TObject`. */
  Expect<
    Equal<
      typeof asObject,
      TObject<{ readonly name: TString; readonly iataCode: TString }>
    >
  >,

  /** The `color` split: one node, two precisely-different conversions. */
  Expect<Equal<typeof asColourText, TString>>,
  Expect<Equal<typeof asColourChannels, TArray<TNumber>>>,

  /** `use`'s kind-tagged forms convert as their tag says. */
  Expect<Equal<typeof asUseString, TString>>,

  /**
   * `use.opaque` is the one builder that converts to `Unknown` — honest,
   * since it is the only place the caller has told us nothing about the
   * shape. `Adapter.test.ts`'s sweep carves it out for the same reason.
   */
  Expect<Equal<typeof asUseOpaque, TUnknown>>,
];

test("compile-time only", () => {});
