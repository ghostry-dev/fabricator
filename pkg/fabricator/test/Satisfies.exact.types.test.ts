import { initialize, registry, type SatisfiedBy } from "@ghostry/fabricator";

/** Same `Expect` as `Satisfies.types.test.ts`, declared locally. */
type Expect<_ extends true> = true;

const { T } = initialize({ types: registry });

/* -------------------------------------------------------------------------- */
/*  `T.optional` produces `note?: string | undefined` — omitted, present as   */
/*  `undefined`, or present with a value — and `note?: string` only rejects   */
/*  that under `exactOptionalPropertyTypes: true`. With the flag off the two  */
/*  spell one type, so nothing here can be asserted there: this file is the   */
/*  one `tsconfig.inexact.json` excludes (`*.exact.types.test.ts`). The half  */
/*  that holds either way is in `Satisfies.types.test.ts`.                    */
/* -------------------------------------------------------------------------- */

type NoteOptional = { id: string; note?: string };

const id = T.string.whereby({ length: { min: 8, max: 8 } });

// @ts-expect-error — T.optional produces note?: string | undefined
const optionalNoteNarrow = T.object({
  id,
  note: T.optional(T.string.whereby({ length: { max: 40 } })),
}).satisfies<NoteOptional>();

const optionalNoteSchema = T.object({
  id,
  note: T.optional(T.string.whereby({ length: { max: 40 } })),
});

export type OptionalSatisfiesFailure = Expect<
  // @ts-expect-error — T.optional vs note?: string
  SatisfiedBy<NoteOptional, typeof optionalNoteSchema>
>;

/**
 * Keep the rejected fixture referenced so `noUnusedLocals` does not treat a
 * missing `@ts-expect-error` as an unused binding.
 */
export const fixtures = { optionalNoteNarrow };
