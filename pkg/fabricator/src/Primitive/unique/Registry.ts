import { unique as array } from "../array/Registry";
import { unique as bigint } from "../bigint/Registry";
import { unique as date } from "../date/Registry";
import { unique as enumeration } from "../enum/Registry";
import { unique as number } from "../number/Registry";
import { unique as record } from "../record/Registry";
import { unique as string } from "../string/Registry";

/**
 * `T.unique`: the builders whose Schemas promise distinct values. Not a kind —
 * each builder returns an ordinary Schema of its own kind with `unique` on
 * `[Meta]`, so dispatch, `Fabricated`, and adapters treat it as that kind. Two
 * shapes:
 *
 * - **Leaves** (`enum`, `number`, `bigint`, `string`, `date`) never repeat a
 *   value for their built Fabricator's lifetime — across every `.fabricate()`
 *   call, and across every `fabricate(schema)` call in one scope.
 * - **Collections** (`array`, `record`) hold distinct members within each value
 *   they fabricate, and are free to repeat across values.
 *
 * Each kind's own `Registry.ts` builds its variant beside its ordinary one, so
 * the kind-specific checks and labels stay with the kind; this module only
 * assembles them. See AGENTS.md's "Uniqueness".
 */
type ThisRegistry = {
  readonly enum: typeof enumeration;

  /**
   * A getter, like `T.number`: each read is a fresh Schema (AGENTS.md's
   * "Registry entries are getters").
   */
  readonly number: ReturnType<typeof number>;

  readonly bigint: typeof bigint;
  readonly string: typeof string;

  /** A getter, like `T.date` — see `number`. */
  readonly date: ReturnType<typeof date>;

  readonly array: typeof array;
  readonly record: typeof record;
};

const registry: ThisRegistry = {
  enum: enumeration,
  get number() {
    return number();
  },
  bigint,
  string,
  get date() {
    return date();
  },
  array,
  record,
};

export default registry;
