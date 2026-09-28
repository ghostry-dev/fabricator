import { isPlainObject } from "@ghostry/fabricator/internal";
import type { Node, TypeCounts } from "../Types";
import { ArrayTally } from "./Array";
import { BigIntTally } from "./BigInt";
import { BooleanTally } from "./Boolean";
import type { Context, Path } from "./Context";
import { DateTally } from "./Date";
import { NumericTally, asNumber } from "./Numeric";
import { ObjectTally } from "./Object";
import { StringTally } from "./String";

/**
 * Everything observed at one path: a count per type, and a tally per type seen,
 * each created on first sight so an all-string column carries no numeric tally.
 * A node at the `depth` limit still counts arrays and objects but does not
 * descend into them.
 *
 * "Object" is `isPlainObject` — core's own test for a plain record — so a class
 * instance, `Map` or typed array is `other` rather than walked as fields.
 */
export class NodeTally {
  private count = 0;
  private truncated = 0;
  private readonly types: TypeCounts = {
    number: 0,
    string: 0,
    boolean: 0,
    bigint: 0,
    date: 0,
    null: 0,
    undefined: 0,
    array: 0,
    object: 0,
    other: 0,
  };

  private number: NumericTally | null = null;
  private string: StringTally | null = null;
  private boolean: BooleanTally | null = null;
  private bigint: BigIntTally | null = null;
  private date: DateTally | null = null;
  private array: ArrayTally | null = null;
  private object: ObjectTally | null = null;

  constructor(
    private readonly context: Context,
    private readonly path: Path,
    private readonly depth: number,
  ) {}

  add(value: unknown): void {
    this.count++;
    switch (typeof value) {
      case "undefined":
        this.types.undefined++;
        return;
      case "number":
        this.types.number++;
        this.numbers().add(value);
        return;
      case "string":
        this.types.string++;
        this.strings().add(value);
        return;
      case "boolean":
        this.types.boolean++;
        this.booleans().add(value);
        return;
      case "bigint":
        this.types.bigint++;
        this.bigints().add(value);
        return;
      case "object":
        break;
      default:
        this.types.other++;
        return;
    }

    if (value === null) {
      this.types.null++;
      return;
    }
    if (value instanceof Date) {
      this.types.date++;
      this.dates().add(value);
      return;
    }
    if (Array.isArray(value)) {
      this.types.array++;
      if (this.atLimit()) this.truncated++;
      else this.arrays().add(value);
      return;
    }
    if (isPlainObject(value)) {
      this.types.object++;
      if (this.atLimit()) this.truncated++;
      else this.objects().add(value as Record<string, unknown>);
      return;
    }
    this.types.other++;
  }

  absorb(other: NodeTally): void {
    this.count += other.count;
    this.truncated += other.truncated;
    for (const key of Object.keys(this.types) as Array<keyof TypeCounts>)
      this.types[key] += other.types[key];
    if (other.number !== null) this.numbers().absorb(other.number);
    if (other.string !== null) this.strings().absorb(other.string);
    if (other.boolean !== null) this.booleans().absorb(other.boolean);
    if (other.bigint !== null) this.bigints().absorb(other.bigint);
    if (other.date !== null) this.dates().absorb(other.date);

    /**
     * A limit-depth node never creates composites of its own, so absorbing one
     * from a shallower node counts its values as truncated instead — the same
     * account `add` would have given them here.
     */
    if (other.array !== null) {
      if (this.atLimit()) this.truncated += other.array.count;
      else this.arrays().absorb(other.array);
    }
    if (other.object !== null) {
      if (this.atLimit()) this.truncated += other.object.count;
      else this.objects().absorb(other.object);
    }
  }

  snapshot(): Node {
    return {
      count: this.count,
      types: { ...this.types },
      truncated: this.truncated,
      number: this.number?.snapshot() ?? null,
      string: this.string?.snapshot() ?? null,
      boolean: this.boolean?.snapshot() ?? null,
      bigint: this.bigint?.snapshot() ?? null,
      date: this.date?.snapshot() ?? null,
      array: this.array?.snapshot() ?? null,
      object: this.object?.snapshot() ?? null,
    };
  }

  private atLimit(): boolean {
    return this.depth >= this.context.options.depth;
  }

  private numbers(): NumericTally {
    return (this.number ??= new NumericTally(
      this.context,
      [...this.path, "#number"],
      asNumber,
    ));
  }

  private strings(): StringTally {
    return (this.string ??= new StringTally(this.context, [
      ...this.path,
      "#string",
    ]));
  }

  private booleans(): BooleanTally {
    return (this.boolean ??= new BooleanTally());
  }

  private bigints(): BigIntTally {
    return (this.bigint ??= new BigIntTally(this.context));
  }

  private dates(): DateTally {
    return (this.date ??= new DateTally(this.context, [...this.path, "#date"]));
  }

  private arrays(): ArrayTally {
    return (this.array ??= new ArrayTally(
      this.context,
      [...this.path, "#array"],
      this.depth,
    ));
  }

  private objects(): ObjectTally {
    return (this.object ??= new ObjectTally(
      this.context,
      [...this.path, "#object"],
      this.depth,
    ));
  }
}
