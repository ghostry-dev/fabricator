import type { Field, ObjectTally as ObjectOutput } from "../Types";
import type { Context, Path } from "./Context";
import type { NodeTally } from "./Node";
import { asNumber, NumericTally } from "./Numeric";
import { StringTally } from "./String";

type Entry = { present: number; node: NodeTally };

/**
 * Per-key presence and a child node per key, until `fields` distinct keys have
 * been seen. Past that the node is in record mode: the keys were data, not
 * structure (ids, locales), and one node per key would grow without bound, so
 * every tracked field merges into a single `value` node and every later value
 * goes there too. Merging rather than restarting keeps the values observed
 * before the switch.
 *
 * `keys` and `size` are kept in both modes: a record suggestion needs the key
 * shape and per-object size whether the switch happened or a wide object just
 * looks like one.
 *
 * Fields live in a `Map`, never an object keyed by field name, because keys are
 * data and `"__proto__"` is a legal one; the census reports them as an array
 * for the same reason.
 */
export class ObjectTally {
  count = 0;
  private readonly size: NumericTally;
  private readonly keys: StringTally;
  private fields: Map<string, Entry> | null = new Map();
  private value: NodeTally | null = null;

  constructor(
    private readonly context: Context,
    private readonly path: Path,
    private readonly depth: number,
  ) {
    this.size = new NumericTally(context, [...path, "#size"], asNumber);
    this.keys = new StringTally(context, [...path, "{key}"]);
  }

  add(value: Record<string, unknown>): void {
    this.count++;
    const keys = Object.keys(value);
    this.size.add(keys.length);
    for (const key of keys) {
      this.keys.add(key);
      this.observe(key, 1, (node) => node.add(value[key]));
    }
  }

  absorb(other: ObjectTally): void {
    this.count += other.count;
    this.size.absorb(other.size);
    this.keys.absorb(other.keys);
    if (other.fields === null) {
      this.toRecord().absorb(other.value!);
      return;
    }
    for (const [key, entry] of other.fields)
      this.observe(key, entry.present, (node) => node.absorb(entry.node));
  }

  snapshot(): ObjectOutput {
    const fields: Field[] | null =
      this.fields === null
        ? null
        : [...this.fields].map(([key, entry]) => ({
            key,
            present: entry.present,
            absent: this.count - entry.present,
            node: entry.node.snapshot(),
          }));
    return {
      count: this.count,
      size: this.size.snapshot(),
      keys: this.keys.snapshot(),
      record: this.fields === null,
      fields,
      value: this.value?.snapshot() ?? null,
    };
  }

  /**
   * Route `present` observations of `key` into its node — the field's own, or
   * the merged `value` node once in record mode (entering it if `key` would be
   * one field too many).
   */
  private observe(
    key: string,
    present: number,
    into: (node: NodeTally) => void,
  ): void {
    const fields = this.fields;
    if (fields === null) {
      into(this.value!);
      return;
    }
    let entry = fields.get(key);
    if (entry === undefined) {
      if (fields.size >= this.context.options.fields) {
        into(this.toRecord());
        return;
      }
      entry = {
        present: 0,
        node: this.context.node([...this.path, `.${key}`], this.depth + 1),
      };
      fields.set(key, entry);
    }
    entry.present += present;
    into(entry.node);
  }

  private toRecord(): NodeTally {
    if (this.value !== null) return this.value;
    const value = this.context.node([...this.path, "{value}"], this.depth + 1);
    for (const entry of this.fields!.values()) value.absorb(entry.node);
    this.fields = null;
    this.value = value;
    return value;
  }
}
