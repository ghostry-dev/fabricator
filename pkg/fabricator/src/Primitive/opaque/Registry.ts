import type { Produce } from "../../Random/Types";
import { Kind, Meta } from "../../Types";
import { Schema } from "./Schema";

/**
 * A value this library has no kind for — a `Map`, a `Set`, a `URL`, a class
 * instance — produced by `produce` and typed as whatever it returns, so
 * `T.opaque((random) => new Map<string, number>())` needs no annotation.
 *
 * `produce` receives this schema's own seeded stream, so an opaque value still
 * replays from a salt; see `Types.ts`'s `Produce`. No bare form and no `.as()`
 * — `produce` is the whole schema.
 */
export default function <$T>(produce: Produce<$T>): Schema<$T> {
  return Schema({ [Kind]: "opaque", [Meta]: { produce } });
}
