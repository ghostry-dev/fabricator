import { initialize } from "@ghostry/fabricator";
import { Meta } from "@ghostry/fabricator/internal";

const { T } = initialize();

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
