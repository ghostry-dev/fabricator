import { Replace } from "../Types";
import { isPlainObject, mergeableKeys } from "./Core";
import type { PlainObject, Pretty } from "./Types";

export type DeepMerge<$A, $B> = $B extends { [Replace]: true }
  ? Pretty<Omit<$B, typeof Replace>>
  : Pretty<{
      [$K in Exclude<keyof $A | keyof $B, typeof Replace>]: $A extends {
        [_ in $K]?: infer $AV;
      }
        ? $B extends { [_ in $K]?: infer $BV }
          ? $AV extends PlainObject
            ? $BV extends PlainObject
              ? DeepMerge<$AV, $BV>
              : $BV
            : $BV
          : $AV
        : $B extends { [_ in $K]?: infer $BV }
          ? $BV
          : never;
    }>;

/**
 * Copies property descriptors rather than values, so a getter stays a getter on
 * the result. The registry depends on that: every registry entry that is a
 * Schema is a getter returning a fresh object (`Schema/Registry.ts`), and a
 * merge that copied its value would pin it to one.
 *
 * Where both sides hold a key, each is read once — a getter included — and the
 * values merge as they always have. If either side was a getter, the result is
 * a getter again, returning a new object {@link rebuilt} from the merged one on
 * every read, so an entry an extension merges into stays fresh.
 */
export function deepMerge<$A extends PlainObject, $B extends PlainObject>(
  a: $A,
  b: $B,
): DeepMerge<$A, $B> {
  const result: PlainObject = {};

  if (Replace in b && b[Replace] === true) {
    for (const key of mergeableKeys(b)) copy(result, b, key);
    return result as DeepMerge<$A, $B>;
  }

  for (const key of mergeableKeys(a)) copy(result, a, key);

  for (const key of mergeableKeys(b)) {
    const getter = isGetter(result, key) || isGetter(b, key);
    const value = mergeValue(result[key], b[key]);
    Object.defineProperty(result, key, property(value, getter));
  }

  return result as DeepMerge<$A, $B>;
}

/**
 * The value-level rule: two plain objects merge, and anything else on the right
 * replaces the left wholesale.
 */
function mergeValue(left: unknown, right: unknown): unknown {
  if (isPlainObject(left) && isPlainObject(right))
    return deepMerge(left, right);

  return right;
}

/**
 * A merged value that came from a getter is a getter again. Anything that is
 * not a plain object has no identity worth renewing, so it stays data.
 */
function property(value: unknown, getter: boolean): PropertyDescriptor {
  if (getter && isPlainObject(value))
    return { get: () => rebuilt(value), enumerable: true, configurable: true };

  return own({ value });
}

/**
 * A new object with `value`'s own properties, getters still getters. For a
 * Schema that is a full stand-in: its methods close over its core, not `this`.
 */
function rebuilt(value: PlainObject): PlainObject {
  return Object.defineProperties({}, Object.getOwnPropertyDescriptors(value));
}

function copy(
  target: PlainObject,
  source: PlainObject,
  key: string | symbol,
): void {
  Object.defineProperty(target, key, own(descriptorOf(source, key)));
}

/**
 * Enumerable, configurable, and (for data) writable, which is what assigning
 * `result[key]` produces. A non-configurable copy would make the later
 * `defineProperty` for the same key throw.
 */
function own(descriptor: PropertyDescriptor): PropertyDescriptor {
  const normalized = { ...descriptor, enumerable: true, configurable: true };
  if (isAccessor(descriptor)) return normalized;
  return { ...normalized, writable: true };
}

function isAccessor(descriptor: PropertyDescriptor): boolean {
  return "get" in descriptor || "set" in descriptor;
}

function isGetter(source: PlainObject, key: string | symbol): boolean {
  return Object.getOwnPropertyDescriptor(source, key)?.get !== undefined;
}

/**
 * `key` comes from `mergeableKeys`, which lists own keys, so the descriptor is
 * always there.
 */
function descriptorOf(
  source: PlainObject,
  key: string | symbol,
): PropertyDescriptor {
  return Object.getOwnPropertyDescriptor(source, key) as PropertyDescriptor;
}
