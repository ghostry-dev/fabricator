import { Replace } from "../Types";
import { type PlainObject } from "./Types";

/**
 * Syntactic sugar for an IIFE.
 */
export function inline<$T>(fn: () => $T) {
  return fn();
}

export function never(_: never): never {
  return (_ && undefined) || undefined;
}

/**
 * Does nothing, deliberately. For attaching a settled handler to a promise
 * being abandoned, so it cannot surface as an unhandled rejection.
 */
export function noop(): void {}

/**
 * Whether a value is thenable — the structural test, not `instanceof Promise`,
 * since an `async` function's return may be any conforming implementation.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as PromiseLike<unknown>).then === "function";
}

/**
 * @see https://github.com/microsoft/TypeScript/issues/17002
 */
export function isArray(
  candidate: unknown,
): candidate is Array<unknown> | ReadonlyArray<unknown> {
  return Array.isArray(candidate);
}

const POLLUTION_KEYS = Object.freeze(
  new Set(["__proto__", "constructor", "prototype"]),
);

export function isPollutionKey(key: string): boolean {
  return POLLUTION_KEYS.has(key);
}

/**
 * A plain `{}`/`Object.create(null)` object — not an array, `Date`, class
 * instance, etc.
 */
export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object") return false;
  if (value === null) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Keys worth carrying across a merge. String keys are subject to the
 * prototype-pollution guard; symbol keys (e.g. a fabricator's
 * `[Kind]`/`[Meta]`) are carried through — dropping them would strip a
 * primitive's identity when it is extended — except `Replace`, which is a
 * directive consumed here rather than data to propagate.
 */
export function mergeableKeys(source: PlainObject): Array<string | symbol> {
  return Reflect.ownKeys(source).filter((key) => {
    if (key === Replace) return false;
    if (typeof key === "symbol") return true;
    return !isPollutionKey(key);
  });
}

/**
 * Tag an object so a subsequent deep or shallow merge replaces the left-hand
 * operand wholesale instead of merging into it. The `[Replace]` directive is
 * consumed by the merge and does not appear on the result, so callers can wrap
 * a replacement value without ever naming the symbol.
 */
export function replace<$T extends PlainObject>(
  value: $T,
): $T & { [Replace]: true } {
  return { ...value, [Replace]: true };
}
