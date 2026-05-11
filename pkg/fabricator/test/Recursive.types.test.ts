import { initialize, registry } from "@ghostry/fabricator";

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

/* -------------------------------------------------------------------------- */
/*  The value type is inferred, with no annotation, to arbitrary depth — the   */
/*  self-referential `RecursiveValue<$Body> = ValueOf<$Body, [RecursiveValue<  */
/*  $Body>]>` alias that makes this possible is legal only because the        */
/*  recursion routes through an interface member lookup (`this["bindings"]`   */
/*  on every composite kind's `Core` — see `CLAUDE.md`'s "`ValueOf`'s         */
/*  `$Bindings`" section). This file is what would catch a regression back   */
/*  to `unknown`/`any` if that mechanism ever broke.                          */
/* -------------------------------------------------------------------------- */

const tree = new Fabricator(
  T.recursive((self) =>
    T.object({
      value: T.number.integer.whereby({ min: 0, max: 9 }),
      label: T.string.whereby({ length: { max: 4 } }),
      children: T.array(self).whereby({ length: { max: 2 } }),
    }),
  ).whereby({ depth: { max: 3 } }),
);

type Tree = ReturnType<(typeof tree)["fabricate"]>;

const fabricated = tree.fabricate();

export type Assertions = [
  Expect<Equal<Equal<Tree, unknown>, false>>,
  Expect<Equal<Equal<Tree, any>, false>>,
  Expect<Equal<Tree["value"], number>>,
  Expect<Equal<Tree["label"], string>>,
  Expect<Equal<Tree["children"][number]["value"], number>>,
  Expect<Equal<Tree["children"][number]["children"][number]["label"], string>>,
  /** Four levels down, still precise — no collapse to `unknown` partway. */
  Expect<
    Equal<
      Tree["children"][number]["children"][number]["children"][number]["value"],
      number
    >
  >,
];

/** The runtime value actually satisfies the inferred type, in both directions. */
export const runtimeAgreesWithInferredType: Tree = fabricated;
const alsoAssignableBack: ReturnType<(typeof tree)["fabricate"]> =
  runtimeAgreesWithInferredType;
export { alsoAssignableBack };

/* -------------------------------------------------------------------------- */
/*  A choice (JSON-value) body infers to a union, not just an object shape.   */
/* -------------------------------------------------------------------------- */

const json = new Fabricator(
  T.recursive((self) =>
    T.choice.uniform([
      T.string.whereby({ length: { max: 5 } }),
      T.number,
      T.array(self).whereby({ length: { max: 2 } }),
    ]),
  ).whereby({ depth: { max: 2 } }),
);

type Json = ReturnType<(typeof json)["fabricate"]>;

export type JsonAssertions = [Expect<Equal<Json, string | number | Json[]>>];

/* -------------------------------------------------------------------------- */
/*  Negative controls: wrong shapes must still be rejected, precisely because  */
/*  the recursive value type is real and checked, not `any`/`unknown`.        */
/* -------------------------------------------------------------------------- */

const wrongLeafValue = { ...fabricated, value: "not a number" };
// @ts-expect-error `value` must be a number
const badLeaf: Tree = wrongLeafValue;

const wrongChildValue = { ...fabricated.children[0], value: "nope" };
// @ts-expect-error a child's `value` must be a number too
const badChild: Tree = { ...fabricated, children: [wrongChildValue] };

const missingLabel = { value: 1, children: [] };
// @ts-expect-error a nested child is missing `label` entirely
const badNested: Tree = { ...fabricated, children: [missingLabel] };

export { badLeaf, badChild, badNested };
