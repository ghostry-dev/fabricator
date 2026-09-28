/**
 * Compile-time only: the pieces of a suggestion slot straight into core's
 * builders, so applying one needs no cast. Nothing here runs — each function is
 * a type check that `tsc` performs on its body.
 *
 * @module
 */

import {
  initialize,
  type Composition,
  type Distribution,
  type InputLength,
} from "@ghostry/fabricator";
import type {
  Census,
  FittedDistribution,
  SuggestedComposition,
  SuggestedLength,
  Suggestion,
} from "@ghostry/fabricator-census";
import { census, suggest } from "@ghostry/fabricator-census";

type Extends<A, B> = [A] extends [B] ? true : false;
type Expect<_ extends true> = true;

export type Assertions = [
  Expect<Extends<FittedDistribution, Distribution>>,
  Expect<Extends<SuggestedLength, InputLength>>,
  Expect<Extends<SuggestedComposition, Composition>>,
  Expect<Extends<ReturnType<typeof census.from>, Census>>,
  Expect<Extends<ReturnType<typeof suggest>, Suggestion>>,
];

const { T } = initialize();

type Of<$Kind extends Suggestion["kind"]> = Extract<
  Suggestion,
  { kind: $Kind }
>;

export function numberWhereby(s: Of<"number">) {
  return s.integer
    ? T.number.integer.whereby(s.whereby)
    : T.number.whereby(s.whereby);
}

export function stringWhereby(s: Of<"string">) {
  return T.string.whereby(s.whereby);
}

export function arrayWhereby(s: Of<"array">) {
  return T.array(T.boolean).whereby(s.whereby);
}

export function recordWhereby(s: Of<"record">) {
  return T.record(T.string.whereby({ length: 4 }), T.boolean).whereby(
    s.whereby,
  );
}

export function dateWhereby(s: Of<"date">) {
  const { min, max, distribution } = s.whereby;
  return T.date.whereby({
    min: new Date(min),
    max: new Date(max),
    ...(distribution === null ? {} : { distribution }),
  });
}

export function presenceWeights(
  nullable: Of<"nullable">,
  nullish: Of<"nullish">,
  undefinable: Of<"undefinable">,
  omittable: Of<"omittable">,
  optional: Of<"optional">,
  boolean: Of<"boolean">,
) {
  const inner = T.number;
  return [
    T.nullable(inner).weighted(nullable.weights),
    T.nullish(inner).weighted(nullish.weights),
    T.undefinable(inner).weighted(undefinable.weights),
    T.omittable(inner).weighted(omittable.weights),
    T.optional(inner).weighted(optional.weights),
    T.boolean.weighted(boolean.weights),
  ];
}

export function enumItems(s: Of<"enum">) {
  return T.enum.weighted(s.items);
}
