import { FabricatorError } from "../../../Error";
import type {
  FabricatorContext,
  NaiveFabricator,
} from "../../../Fabricator/Types";
import type { Trace } from "../../../Random/Types";
import { Kind, Meta } from "../../../Types";
import type { Schema } from "./Schema";
import type { Fabricated, Meta as ThisMeta } from "./Types";

export type Fabrication<$Fabricator extends Fabricator> =
  $Fabricator extends Fabricator<infer $Bindings> ? $Bindings[0] : never;

/**
 * Deliberately not parameterized by a Schema the way every other kind's
 * Fabricator type is — `self` carries no config to read a shape from (`[Meta]`
 * is always `{}`), only whatever `$Bindings` its position resolves against.
 */
export type Fabricator<$Bindings extends unknown[] = []> = NaiveFabricator<
  Fabricated<$Bindings>
> & { [Kind]: "recursive.self"; [Meta]: ThisMeta; readonly trace: Trace };

/**
 * A transient passthrough, unlike every other kind's Fabricator — it draws no
 * randomness of its own: a `self` node stands for wherever `T.recursive`'s
 * current expansion is, and `resolve` _is_ that expansion, one level deeper —
 * the same closure `recursive/Fabricator.ts` hands to every `self` in its body
 * via `Constructor.ts`'s `make` context (`case "recursive.self"`). Calling
 * `resolve` is what actually recurses; this function only wraps it in the shape
 * `make` expects back. Absent `resolve` (a `self` rebuilt from its schema plus
 * trace, without the enclosing recursive parent), `.fabricate()` throws
 * `DetachedSelfError`.
 */
export function Fabricator<$Bindings extends unknown[]>(
  context: FabricatorContext<Schema>,
  resolve?: (() => Fabricated<$Bindings>) | undefined,
): Fabricator<$Bindings> {
  const { schema, trace } = context;
  return {
    [Kind]: "recursive.self",
    [Meta]: schema[Meta],
    trace,
    fabricate: () => {
      if (!resolve) {
        throw new FabricatorError.DetachedSelfError("construction");
      }
      return resolve();
    },
  };
}
