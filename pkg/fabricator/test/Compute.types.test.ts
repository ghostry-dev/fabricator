import { initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";

const { T, Fabricator } = initialize();

const Greeted = T.object({
  name: T.string.whereby({ length: { max: 8 } }),
  age: T.number.integer,
  note: T.string.whereby({ length: { max: 8 } }),
}).refine(({ compute }) => ({
  greeting: compute(T.string)
    .from(["name"])
    .as(({ fabricated }) => `hi ${fabricated.name}`),
}));

/**
 * A compute entry can only enter through `.refine()`. Wrapped, since each call
 * also throws `ComputeOutsideRefineError` when run.
 */
const greeting = Greeted[Meta].definition.greeting;
void (() => {
  // @ts-expect-error a compute field placed by `T.object`.
  T.object({ greeting });
  // @ts-expect-error a compute field returned from `.extend`.
  Greeted.extend(({ base }) => ({ alias: base.greeting }));
});

/** A field a compute field reads keeps its type; any other may change. */
Greeted.extend(() => ({ name: T.always("grace") }));
// @ts-expect-error `name` is read by `greeting`, which takes a string.
Greeted.extend(() => ({ name: T.number.integer }));
Greeted.extend(() => ({ note: T.number.integer }));

/** A plain `.as` reads every field of its base. */
const Summed = T.object({ a: T.number.integer, b: T.number.integer }).refine(
  ({ compute }) => ({
    sum: compute(T.number).as(({ fabricated }) => fabricated.a + fabricated.b),
  }),
);
// @ts-expect-error `b` is read by `sum`.
Summed.extend(() => ({ b: T.string.whereby({ length: { max: 8 } }) }));
Summed.extend(() => ({ c: T.string.whereby({ length: { max: 8 } }) }));

/** A field that replaced its own key reads the previous version, untouched. */
const Shouted = T.object({
  name: T.string.whereby({ length: { max: 8 } }),
}).refine(({ compute }) => ({
  name: compute(T.string)
    .from(["name"])
    .as(({ fabricated }) => fabricated.name.toUpperCase()),
}));
Shouted.extend(() => ({ name: T.number.integer }));

/* -------------------------------------------------------------------------- */
/*  `.rebase()`: typed against what the schema's compute fields read.          */
/* -------------------------------------------------------------------------- */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;

const Staged = T.object({
  name: T.enum.uniform(["ada", "grace"]),
  note: T.string.whereby({ length: { max: 8 } }),
})
  .refine(({ compute }) => ({
    greeting: compute(T.string)
      .from(["name"])
      .as(({ fabricated }) => `hi ${fabricated.name}`),
    /** `.from([])`: a plain `.as` would read `note` too. */
    tag: compute(T.enum.uniform(["x", "y"]))
      .from([])
      .as(() => "x" as const),
  }))
  .refine(({ compute }) => ({
    name: compute(T.string)
      .from(["name"])
      .as(({ fabricated }) => fabricated.name.toUpperCase()),
  }));

const rebasedName = new Fabricator(
  Staged.rebase({ name: T.always("ada") }),
).fabricate();
/** A compute field reading its own key keeps its type: its input changed. */
const keepsCompute: Expect<Equal<typeof rebasedName.name, string>> = true;
void keepsCompute;

/** Wrapped, since a rejected rebase also throws when run. */
void (() => {
  // @ts-expect-error `name` is read as `"ada" | "grace"`.
  Staged.rebase({ name: T.number.integer });
  // @ts-expect-error `nope` is not a field.
  Staged.rebase({ nope: T.always(1) });
  // @ts-expect-error a compute field passed to `.rebase`.
  Staged.rebase({ note: Staged[Meta].definition.greeting });
});

/** A plain field nothing replaced takes the rebased type. */
const rebasedNote = new Fabricator(
  Staged.rebase({ note: T.number.integer }),
).fabricate();
const takesRebase: Expect<Equal<typeof rebasedNote.note, number>> = true;
void takesRebase;

/** Any other compute field is either. */
const rebasedTag = new Fabricator(
  Staged.rebase({ tag: T.always("z") }),
).fabricate();
const either: Expect<Equal<typeof rebasedTag.tag, "x" | "y" | "z">> = true;
void either;

/** A hidden key a kept compute field reads can be rebased, checked by it. */
const Picked = T.pick(Staged, ["greeting"]);
const rebasedHidden = new Fabricator(
  Picked.rebase({ name: T.always("ada") }),
).fabricate();
const staysHidden: Expect<Equal<keyof typeof rebasedHidden, "greeting">> = true;
void staysHidden;
void (() => {
  // @ts-expect-error `greeting` reads `name` as `"ada" | "grace"`.
  Picked.rebase({ name: T.number.integer });
  // @ts-expect-error nothing kept reads `note`, so it is not there.
  Picked.rebase({ note: T.always("x") });
});
