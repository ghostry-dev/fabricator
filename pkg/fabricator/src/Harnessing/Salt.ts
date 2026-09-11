import type { Identity } from "./Types";

/**
 * The salt `integration` layers onto the instance for one `Identity`.
 *
 *     [ <kind>, ...<describe names>, <name>, <row?> ]
 *
 * **No file, deliberately.** Every test body runs inside its own
 * `instance.wrap`, which builds a fresh `RandomSource` with a fresh
 * construction counter, so constructions are already partitioned per test.
 * Identity comes from a path, never from an execution counter or a location
 * that moves when a file does.
 *
 * The accepted cost: two tests with the same `kind`, describe path, and name in
 * _different files_ share a salt and therefore draw the same data. Each is
 * still deterministic. That is the same trade already made in dropping
 * duplicate-path detection, and the fix is the ordinary one — give them
 * distinguishable names.
 *
 * `kind` leads. Without it, an empty-named test collides with its enclosing
 * suite scope: `path` never carries a leaf's own name, only its describes, and
 * `name` is `""` for both a `"suite"` identity (by design — see `Identity`) and
 * any test a user happens to name `""`, so at the same `path` the two arrays
 * would otherwise be identical. `kind` does not disambiguate two suite
 * identities that share a `path` (a `beforeAll` and an `afterAll` in one
 * `describe`, say) — that collision is intentional, a suite's setup and
 * teardown sharing one deterministic scope, and a caller who wants otherwise
 * already has `instance.wrap(...)` inside the hook body.
 *
 * The row is appended only for `.each`.
 */
export function saltFor(identity: Identity): ReadonlyArray<string> {
  const salt: ReadonlyArray<string> = [
    identity.kind,
    ...identity.path,
    identity.name,
  ];

  return typeof identity.row === "number"
    ? [...salt, String(identity.row)]
    : salt;
}
