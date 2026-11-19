import { Fixed, Kind, Meta } from "../../Types.ts";
import type { Definition } from "./Types.ts";

/**
 * An `object`'s fields by `.refine()` stage (`Types.ts`'s `Meta`): stage 0
 * holds the `T.object(...)` fields, and each `.refine()` appends one holding
 * its compute fields. A key has one entry per version, in the stage that
 * created that version.
 */
export type Stages = ReadonlyArray<Definition>;

/**
 * A stage entry, or the Fabricator built from one: all {@link readsOf} looks at.
 */
type Entry = {
  readonly [Kind]: string;
  readonly [Meta]?: unknown;
  readonly [Fixed]?: unknown;
};

/**
 * The index of the latest stage before `before` with an entry for `key`, or
 * `-1`. With `before` left out, that is the key's current version. A compute
 * field in stage `i` reads each dependency from `stageOf(stages, key, i)`.
 */
export function stageOf(
  stages: ReadonlyArray<object>,
  key: string,
  before: number = stages.length,
): number {
  for (let i = Math.min(before, stages.length) - 1; i >= 0; i--) {
    if (has(stages[i]!, key)) return i;
  }
  return -1;
}

/**
 * The fields an entry reads: a compute field's `dependencies`
 * (`compute/Types.ts`), unless `.override()` fixed its value, in which case its
 * resolver never runs. Every other entry reads nothing.
 */
export function readsOf(entry: Entry): ReadonlyArray<string> {
  if (Fixed in entry) return [];
  if (entry[Kind] !== "object.compute") return [];
  return (entry[Meta] as { dependencies: ReadonlyArray<string> }).dependencies;
}

/**
 * The visible view `[Meta].definition` holds: each key of `order`, in that
 * order, at its current version.
 */
export function toDefinition(
  stages: Stages,
  order: ReadonlyArray<string>,
): Definition {
  const definition: Definition = {};
  for (const key of order) {
    put(definition, key, stages[stageOf(stages, key)]![key]!);
  }
  return definition;
}

/**
 * `entries` written over `stages` where each key stands: a key that already has
 * an entry replaces its current version in place, so every compute field
 * reading that version reads the new entry. Any other key goes into the last
 * stage, which no compute field reads from: a compute field only reads earlier
 * stages, and later ones see it as current.
 */
export function withEntries(stages: Stages, entries: Definition): Stages {
  const next = stages.map((stage) => ({ ...stage }));
  if (next.length === 0) next.push({});

  for (const [key, entry] of Object.entries(entries)) {
    const at = stageOf(next, key);
    put(next[at === -1 ? next.length - 1 : at]!, key, entry);
  }

  return next;
}

/**
 * Keep only the entries something reads: the current version of each key in
 * `order`, and, transitively, the version each kept compute field reads of its
 * dependencies. Every other entry and every empty stage is dropped. Dropping
 * never changes what a kept compute field reads: the version it reads is the
 * latest before its stage, and that one is kept.
 */
export function prune(stages: Stages, order: ReadonlyArray<string>): Stages {
  const kept = stages.map(() => new Set<string>());
  const pending: Array<[number, string]> = [];

  const keep = (at: number, key: string): void => {
    if (at === -1 || kept[at]!.has(key)) return;
    kept[at]!.add(key);
    pending.push([at, key]);
  };

  for (const key of order) keep(stageOf(stages, key), key);

  while (pending.length > 0) {
    const [at, key] = pending.pop()!;
    for (const dependency of readsOf(stages[at]![key]!)) {
      keep(stageOf(stages, dependency, at), dependency);
    }
  }

  return stages
    .map((stage, i) =>
      Object.fromEntries(
        Object.entries(stage).filter(([key]) => kept[i]!.has(key)),
      ),
    )
    .filter((stage) => Object.keys(stage).length > 0);
}

function has(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * An own data property even for `"__proto__"`, which plain assignment would
 * treat as the prototype. Such a key still reaches `Fabricator.ts`, which
 * rejects it with `PrototypePollutionError`.
 */
function put(target: Definition, key: string, value: Definition[string]): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
