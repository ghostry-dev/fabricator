/**
 * Compile-time only: the cases `.admits(...)`'s input types reject. Each sits
 * in a function that never runs, so a throw at `.admits` cannot mask a missing
 * type error.
 *
 * @module
 */

import { initialize } from "@ghostry/fabricator";

const { T } = initialize({ salt: "admits-types" });

export function past() {
  // @ts-expect-error — past's upper end is the clock
  T.date.past.admits({ max: 0 });
  T.date.past.admits({ min: 0 });
}

export function future() {
  // @ts-expect-error — future's lower end is the clock
  T.date.future.whereby({ max: 0 }).admits({ min: 0 });
  T.date.future.admits({ max: Infinity });
}

export function keys() {
  // @ts-expect-error — a string admits a length, not a size
  T.string.whereby({ length: 3 }).admits({ size: { max: 3 } });
  // @ts-expect-error — a number admits its own ends, not a length
  T.number.admits({ length: { max: 3 } });
}

export function values() {
  const array = T.array(T.always(1)).whereby({ length: 3 });
  // @ts-expect-error — a length end is a number
  array.admits({ length: { max: "9" } });
  T.bigint.whereby({ max: 3 }).admits({ max: 9, min: BigInt(-9) });
}

export function keywords() {
  // @ts-expect-error — format describes a string
  T.number.admits({ format: "email" });
  // @ts-expect-error — multipleOf describes a number
  T.string.whereby({ length: 3 }).admits({ multipleOf: 2 });
  // @ts-expect-error — keywords moved from .as to .admits
  T.string.as(() => "", { format: "email" });
  T.string.as(() => "").admits({ format: "email", pattern: "@" });
  T.number.integer.admits({ multipleOf: 2 });
}
