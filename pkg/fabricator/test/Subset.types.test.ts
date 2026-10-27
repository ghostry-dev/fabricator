import { initialize, type Fabricated } from "@ghostry/fabricator";

/**
 * Compile-time assertions, in the same `Equal`/`Expect` form as
 * `Fabrication.types.test.ts`. `Flat` re-maps a shape so the irrelevant `& {}`
 * that `Pretty` adds does not fail the strict `Equal`.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<_ extends true> = true;
type Flat<$T> = { [$K in keyof $T]: $T[$K] };

const { T } = initialize();

const User = T.object({
  id: T.number.integer,
  first: T.string.whereby({ length: { max: 8 } }),
  last: T.string.whereby({ length: { max: 8 } }),
  nickname: T.omittable(T.string.whereby({ length: { max: 8 } })),
}).refine(({ compute }) => ({
  name: compute(T.string)
    .from(["first", "nickname"])
    .as(({ fabricated }) => {
      const narrowed: Expect<
        Equal<Flat<typeof fabricated>, { first: string; nickname?: string }>
      > = true;
      void narrowed;
      // @ts-expect-error `last` is not among the `.from` dependencies.
      fabricated.last;
      return fabricated.first;
    }),
}));

const picked = T.pick(User, ["id", "name"]);
const omitted = T.omit(User, ["first", "nickname"]);

export type Assertions = [
  Expect<Equal<Flat<Fabricated<typeof picked>>, { id: number; name: string }>>,
  Expect<
    Equal<
      Flat<Fabricated<typeof omitted>>,
      { id: number; last: string; name: string }
    >
  >,
];

/**
 * Never called: each of these also throws at runtime, and this file still runs
 * under `bun test`.
 */
export function rejected(): void {
  // @ts-expect-error `nope` is not a field of `User`.
  T.pick(User, ["nope"]);
  // @ts-expect-error `nope` is not a field of `User`.
  T.omit(User, ["nope"]);

  T.object({ a: T.always(1) }).refine(({ compute }) => ({
    // @ts-expect-error `nope` is not a field of the refine stage's base.
    b: compute(T.number).from(["nope"]),
  }));
}
