import type { ArrayTally as ArrayOutput } from "../Types";
import type { Context, Path } from "./Context";
import type { NodeTally } from "./Node";
import { asNumber, NumericTally } from "./Numeric";

/**
 * Every position of every array merges into one `element` node — the shape
 * core's `T.array(element)` fabricates — so a positional tuple reads as a mixed
 * element type rather than as slots (a documented v1 non-goal).
 */
export class ArrayTally {
  count = 0;
  private readonly length: NumericTally;
  private readonly element: NodeTally;

  constructor(context: Context, path: Path, depth: number) {
    this.length = new NumericTally(context, [...path, "#length"], asNumber);
    this.element = context.node([...path, "[]"], depth + 1);
  }

  /**
   * Indexed rather than iterated, so a hole reads as `undefined` exactly as
   * `for…of` would yield it, without relying on that.
   */
  add(value: ReadonlyArray<unknown>): void {
    this.count++;
    this.length.add(value.length);
    for (let i = 0; i < value.length; i++) this.element.add(value[i]);
  }

  absorb(other: ArrayTally): void {
    this.count += other.count;
    this.length.absorb(other.length);
    this.element.absorb(other.element);
  }

  snapshot(): ArrayOutput {
    return {
      count: this.count,
      length: this.length.snapshot(),
      element: this.element.snapshot(),
    };
  }
}
