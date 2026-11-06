import { Children, Claim, Kind, Omitted } from "../Types";

/**
 * Record a per-call override on the `T.unique.*` leaf it stands in for, so no
 * later draw repeats it. An override skips the field's draw
 * (`object/Fabricator.ts`), so without this the leaf would never learn that the
 * value was used.
 *
 * The field handed in is not always the leaf: `T.omittable(T.unique...)` is how
 * an optional unique field is spelled. So this walks down through the
 * single-child presence wrappers via `[Children]`, stopping where `value` is
 * that wrapper's own outcome (`null`, `undefined`, `Omitted`) rather than its
 * child's, and calls the leaf's `[Claim]`. Any other node ends the walk: a
 * nested `object` records its own fields through its own
 * `fabricate(overrides)`, and nothing else holds a unique leaf whose draw an
 * override could stand in for.
 */
export function recordOverride(field: any, value: unknown): void {
  if (Claim in field) {
    field[Claim](value);
    return;
  }

  if (stopsAt(field[Kind], value)) return;
  recordOverride(field[Children], value);
}

/**
 * Whether the walk stops at a node of `kind`: either it is not a presence
 * wrapper, so nothing beneath it can hold the field's unique leaf, or `value`
 * is the wrapper's own outcome, so its child never stood to draw. A wrapper
 * whose `value` belongs to its child continues to that child — the walk ends at
 * the first node that is not a wrapper, and a built tree nests finitely.
 */
function stopsAt(kind: string, value: unknown): boolean {
  switch (kind) {
    case "nullable":
      return value === null;
    case "nullish":
      return value === null || value === undefined;
    case "undefinable":
      return value === undefined;
    case "object.omittable":
      return value === Omitted;
    case "object.optional":
      return value === Omitted || value === undefined;
    default:
      return true;
  }
}
