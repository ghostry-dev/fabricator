import type {
  Kind,
  Meta,
  Primitive,
  Produces,
  ValueOf,
} from "@ghostry/fabricator/internal";

/**
 * Compile-time assertions — see `Fabrication.types.test.ts` for why `Equal`/
 * `Expect` are shaped this way.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;

/* -------------------------------------------------------------------------- */
/*  `ValueOf` threads a `$Bindings` tuple — a substitution slot for a self-     */
/*  reference, not a parameter of the schema the way `$Definition`/`$Value`    */
/*  are — and every composite kind forwards its own `this["bindings"]` into    */
/*  its children. That threading is what makes a type-level fixed point       */
/*  possible: a schema node whose `[Produces]` reads `bindings[0]` closes the  */
/*  loop, so a self-referential alias resolves instead of collapsing to        */
/*  `unknown`. Nothing consumes it yet — these assertions are the only thing   */
/*  standing between the mechanism and a silent revert.                       */
/*                                                                            */
/*  Three traps, each of which cost an iteration to find:                     */
/*   - `ValueOf` must read `[Produces]` by INDEXED ACCESS. The conditional     */
/*     `infer` form fails with TS2615, because the bindings don't collapse.    */
/*   - It must strip optionality with `Required<>`, never                      */
/*     `Exclude<…, undefined>` — `Exclude` would also strip the *legitimate*   */
/*     `undefined` from `nullish`/`undefinable`/`optional`/`T.undefined`.      */
/*     `Nullish`/`Undefinable` are asserted below for exactly that reason.     */
/*   - The `$Schema extends …` guard must live inside, not as a constraint on  */
/*     the parameter: constraining it forces `[Produces]` onto `AnySchema`,    */
/*     which changes variance and breaks `.as`'s contravariant check.          */
/*                                                                            */
/*  Each composite's `Core` must stay an `interface` for `this["bindings"]` to */
/*  exist at all — reverting one to a `type` alias silently breaks threading   */
/*  for that kind, which is what these catch.                                  */
/* -------------------------------------------------------------------------- */

/**
 * Stands in for the `self` kind. Borrows `always`'s tag purely to satisfy
 * `AnySchema`; only `[Produces]` matters here, and `ValueOf` reads nothing
 * else.
 */
interface SelfCore {
  [Kind]: "always";
  [Meta]: Record<string, never>;
  bindings?: unknown[];
  readonly [Produces]?: NonNullable<this["bindings"]>[0];
}

/** The fixed point, mirroring TypeBox's `RecursiveStatic`. */
type RecursiveValue<$Body> = ValueOf<$Body, [RecursiveValue<$Body>]>;

type Body = Primitive.object.Core<{
  arr: Primitive.array.Core<SelfCore>;
  tup: Primitive.tuple.Core<readonly [SelfCore, Primitive.number.Core]>;
  rec: Primitive.record.Core<Primitive.string.Core, SelfCore>;
  cho: Primitive.choice.Core<readonly [readonly [1, SelfCore]]>;
  nul: Primitive.nullable.Core<SelfCore>;
  nsh: Primitive.nullish.Core<SelfCore>;
  und: Primitive.undefinable.Core<SelfCore>;
}>;

type R = RecursiveValue<Body>;

export type ThreadingAssertions = [
  /** It resolves at all, rather than collapsing to `unknown`/`any`. */
  Expect<Equal<Equal<R, unknown>, false>>,
  Expect<Equal<Equal<R, any>, false>>,

  /** Every composite forwards bindings to its children. */
  Expect<Equal<R["arr"], R[]>>,
  Expect<Equal<R["tup"], [R, number]>>,
  Expect<Equal<R["rec"], Record<string, R>>>,
  Expect<Equal<R["cho"], R>>,
  Expect<Equal<R["nul"], R | null>>,

  /**
   * The `Required<>`-not-`Exclude<>` cases: these kinds' value types
   * legitimately contain `undefined`, which must survive.
   */
  Expect<Equal<R["nsh"], R | null | undefined>>,
  Expect<Equal<R["und"], R | undefined>>,

  /** And it stays precise several levels down, not just at the first hop. */
  Expect<Equal<R["arr"][number]["arr"][number]["nul"], R | null>>,
  Expect<Equal<R["rec"][string]["tup"], [R, number]>>,
];

/* -------------------------------------------------------------------------- */
/*  Non-recursive schemas must resolve exactly as they did before, via the     */
/*  default `$Bindings = []`. This is the "no user-visible change" guarantee.  */
/* -------------------------------------------------------------------------- */

export type UnchangedAssertions = [
  Expect<
    Equal<
      ValueOf<
        Primitive.object.Core<{
          a: Primitive.number.Core;
          b: Primitive.array.Core<Primitive.string.Core>;
        }>
      >,
      { a: number; b: string[] }
    >
  >,
  Expect<
    Equal<
      ValueOf<Primitive.nullish.Core<Primitive.number.Core>>,
      number | null | undefined
    >
  >,
  Expect<
    Equal<
      ValueOf<Primitive.undefinable.Core<Primitive.string.Core>>,
      string | undefined
    >
  >,
  Expect<
    Equal<
      ValueOf<
        Primitive.tuple.Core<
          readonly [Primitive.number.Core, Primitive.string.Core]
        >
      >,
      [number, string]
    >
  >,
];
