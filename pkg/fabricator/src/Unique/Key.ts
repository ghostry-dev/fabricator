import { cyrb128 } from "../Utility/Digest";
import { isPlainObject } from "../Utility/Core";

/**
 * Maps a value to a number that equal values share — what a tracked unique
 * scope (`Unique/Strategy.ts`) stores in place of the value itself, so memory
 * per produced value stays one number however large the value is.
 */
export type Keyer = (value: unknown) => number;

/**
 * A fresh {@link Keyer}, owning the identity tables its encoding needs. Two
 * values share a key when they are the same plain data:
 *
 * - Primitives compare by SameValueZero, as a `Set` would: `-0` is `0`, `NaN` is
 *   `NaN`, and `"1"` is not `1`.
 * - A `Date` compares by its time value.
 * - Arrays compare element by element, a hole reading as `undefined`.
 * - Plain objects compare by their own enumerable keys and values, in any key
 *   order. A key present as `undefined` differs from an absent one, the
 *   distinction `T.optional` draws.
 *
 * Everything else — symbols, functions, and objects that are not plain data
 * (`Map`, `Set`, class instances) — compares by identity, through an id the
 * tables hand out on first sight. Structural rules for those would be guesses;
 * a `by` projection says what makes one unique.
 *
 * The encoding is hashed to 53 bits (`cyrb128`'s first two words), exact as a
 * `number`. The error is one-sided: two different values sharing a hash makes a
 * scope skip one of them, never produce a duplicate. Across a million values
 * that happens with probability around 5e-5.
 */
export function toKeyer(): Keyer {
  const objects = new WeakMap<object, number>();
  const symbols = new Map<symbol, number>();
  let next = 0;

  /**
   * A `Map` for symbols, not the `WeakMap` objects use: a registered symbol
   * (`Symbol.for`) cannot be a `WeakMap` key, and under this package's `ES2019`
   * target no symbol can.
   */
  function identity(value: object | symbol): number {
    if (typeof value === "symbol") {
      const known = symbols.get(value);
      if (known !== undefined) return known;
      symbols.set(value, next);
      return next++;
    }

    const known = objects.get(value);
    if (known !== undefined) return known;
    objects.set(value, next);
    return next++;
  }

  /**
   * Every branch opens with a tag no other branch's output starts with, and
   * every composite delimits its parts, so two different values never share an
   * encoding. `active` holds the composites being encoded on the current path:
   * meeting one again is a cycle, encoded by identity rather than followed
   * forever.
   */
  function encode(value: unknown, active: Set<object>): string {
    switch (typeof value) {
      case "string":
        return JSON.stringify(value);
      case "number":
        /** `String(-0)` is `"0"`, which is SameValueZero's reading. */
        return `n${value}`;
      case "bigint":
        return `b${value}`;
      case "boolean":
        return value ? "t" : "f";
      case "undefined":
        return "u";
      case "symbol":
        return `y${identity(value)}`;
      case "function":
        return `o${identity(value)}`;
      case "object":
        break;
    }

    if (value === null) return "N";
    if (value instanceof Date) return `d${value.getTime()}`;

    const composite = value as object;
    if (active.has(composite)) return `o${identity(composite)}`;

    if (Array.isArray(composite)) {
      active.add(composite);
      const parts: string[] = [];
      for (let i = 0; i < composite.length; i++) {
        parts.push(encode(composite[i], active));
      }
      active.delete(composite);
      return `[${parts.join(",")}]`;
    }

    if (isPlainObject(composite)) {
      active.add(composite);
      const record = composite as Record<PropertyKey, unknown>;
      const parts = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(record[key], active)}`);
      const symbolic = Object.getOwnPropertySymbols(record)
        .filter((key) =>
          Object.prototype.propertyIsEnumerable.call(record, key),
        )
        .map((key) => [identity(key), record[key]] as const)
        .sort(([a], [b]) => a - b)
        .map(([id, entry]) => `y${id}:${encode(entry, active)}`);
      active.delete(composite);
      return `{${[...parts, ...symbolic].join(",")}}`;
    }

    return `o${identity(composite)}`;
  }

  return (value) => {
    const [high, low] = cyrb128(encode(value, new Set()));
    return (high & 0x1fffff) * 0x1_0000_0000 + low;
  };
}
