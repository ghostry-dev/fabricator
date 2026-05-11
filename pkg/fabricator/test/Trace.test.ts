import { expect, test } from "bun:test";
import { FabricatorError, initialize } from "@ghostry/fabricator";
import {
  Children,
  encode,
  Kind,
  Meta,
  type Buildable,
} from "@ghostry/fabricator/internal";
import { fabricateFromTrace } from "./fixtures/replay/fromTrace";

test("a leaf round-trips from its own trace, including from another file and another instance", () => {
  const instance = initialize({
    seed: "trace-leaf-roundtrip",
    clock: "seeded",
  });
  const schema = instance.T.number;
  const built = new instance.Fabricator(schema);
  const original = built.fabricate();

  expect(new instance.Fabricator(schema, built.trace).fabricate()).toBe(
    original,
  );
  expect(
    fabricateFromTrace(instance.Fabricator, schema, built.trace),
  ).toBe(original);

  const other = initialize({
    seed: "unrelated-instance-seed",
    clock: new Date("1999-01-01T00:00:00.000Z"),
  });
  expect(new other.Fabricator(other.T.number, built.trace).fabricate()).toBe(
    original,
  );
});

test("a nested object subtree round-trips from the field's own schema plus its trace", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-nested-object",
    clock: "seeded",
  });

  const profile = T.object({
    city: T.string.whereby({ length: { max: 12 } }),
    tags: T.array(T.enum.uniform(["a", "b", "c"])).whereby({
      length: { max: 3 },
    }),
    pick: T.choice.uniform([
      T.boolean,
      T.number.integer.whereby({ min: 0, max: 9 }),
    ]),
  });
  const user = T.object({
    name: T.string.whereby({ length: { max: 8 } }),
    profile,
  });

  const built = new Fabricator(user);
  const nested = built[Children].profile!;
  expect(nested[Kind]).toBe("object");
  expect(nested.trace.path).toEqual(["profile"]);

  const fromParent = built.fabricate();
  const fromNested = new Fabricator(profile, nested.trace).fabricate();

  expect(fromNested).toEqual(fromParent.profile);
});

test("traces are self-describing: root distinguishes the three file: undefined cases, and each round-trips", () => {
  const attributedNone = initialize({
    seed: "trace-root-none",
    clock: "seeded",
    attribution: { kind: "none" },
  });
  const noneBuilt = new attributedNone.Fabricator(attributedNone.T.number);
  expect(noneBuilt.trace.root).toBe("attributed");
  expect(noneBuilt.trace.file).toBeUndefined();
  expect(
    new attributedNone.Fabricator(attributedNone.T.number, noneBuilt.trace)
      .fabricate(),
  ).toBe(noneBuilt.fabricate());

  const seeded = initialize({ seed: "trace-root-seeded", clock: "seeded" });
  const seededBuilt = new seeded.Fabricator(seeded.T.number, {
    seed: "explicit",
  });
  expect(seededBuilt.trace.root).toBe("unattributed");
  expect(seededBuilt.trace.file).toBeUndefined();
  expect(
    new seeded.Fabricator(seeded.T.number, seededBuilt.trace).fabricate(),
  ).toBe(seededBuilt.fabricate());

  const defaulted = initialize({
    seed: "trace-root-default",
    clock: "seeded",
  });
  expect(new defaulted.Fabricator(defaulted.T.number).trace.root).toBe(
    "attributed",
  );

  /**
   * A recursive body's expansion opens `"counted"` on a private fork
   * seeded from `encode(parent.trace)`. Reconstructing that body's
   * own Fabricator from those pins is how a node inside an expansion
   * is observed — the expansion itself is throwaway.
   */
  const body = defaulted.T.object({
    n: defaulted.T.number,
    flag: defaulted.T.boolean,
  });
  const recursive = defaulted.T.recursive(() => body).whereby({
    depth: { max: 1 },
  });
  const parent = new defaulted.Fabricator(recursive);
  const fromParent = parent.fabricate();
  const inner = new defaulted.Fabricator(body, {
    seed: encode(parent.trace),
    root: "counted",
    clock: parent.trace.clock,
    file: undefined,
    ordinal: 0,
    path: [],
    kind: "object",
  });
  expect(inner.trace.root).toBe("counted");
  expect(inner.trace.file).toBeUndefined();
  expect(inner.fabricate()).toEqual(fromParent);
});

test("a recursive node round-trips — its private fork is keyed off encode(trace)", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-recursive-roundtrip",
    clock: "seeded",
  });

  const schema = T.recursive((self) =>
    T.object({
      value: T.number.integer.whereby({ min: 0, max: 9 }),
      children: T.array(self).whereby({ length: { max: 2 } }),
    }),
  ).whereby({ depth: { max: 3 } });

  const built = new Fabricator(schema);
  expect(new Fabricator(schema, built.trace).fabricate()).toEqual(
    built.fabricate(),
  );
});

test("a pinned ordinal does not bump the construction counter", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-ordinal-bump",
    clock: "seeded",
  });

  const first = new Fabricator(T.number);
  expect(first.trace.ordinal).toBe(0);

  new Fabricator(T.number, first.trace);

  const second = new Fabricator(T.number);
  expect(second.trace.ordinal).toBe(1);
});

test("{ file } without root pins that file and draws from its counter", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-file-pin",
    clock: "seeded",
  });

  const first = new Fabricator(T.number, { file: "fixtures/user" });
  expect(first.trace.file).toBe("fixtures/user");
  expect(first.trace.root).toBe("attributed");
  expect(first.trace.ordinal).toBe(0);

  const second = new Fabricator(T.number, { file: "fixtures/user" });
  expect(second.trace.ordinal).toBe(1);
});

test("a pinned clock reaches ProduceContext and T.date.past, and appears on the resulting trace", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-clock-pin",
    clock: "seeded",
  });
  const clock = 1_700_000_000_000;

  const dated = new Fabricator(T.date.past, { clock });
  expect(dated.trace.clock).toBe(clock);
  expect(dated.fabricate().getTime()).toBeLessThanOrEqual(clock);

  const viaProduce = new Fabricator(
    T.number.as(({ clock: now }) => now),
    { clock },
  );
  expect(viaProduce.fabricate()).toBe(clock);
  expect(viaProduce.trace.clock).toBe(clock);
});

test("an object.compute field rebuilds from its trace but throws DetachedComputeError on fabricate", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-detached-compute",
    clock: "seeded",
  });

  const schema = T.object({ a: T.always(1) }).refine(({ compute }) => ({
    b: compute(T.number).as(({ fabricated }) => fabricated.a + 1),
  }));
  const built = new Fabricator(schema);
  const field = built[Children].b!;
  const fieldSchema = built.schema[Meta].definition.b;

  const replayed = new Fabricator(fieldSchema, field.trace);
  expect(() => replayed.fabricate()).toThrow(FabricatorError.DetachedComputeError);
  expect(built.fabricate().b).toBe(2);
});

test("a recursive.self node rebuilds from its trace but throws DetachedSelfError on fabricate", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-detached-self",
    clock: "seeded",
  });

  let selfSchema!: Buildable;
  T.recursive((self) => {
    selfSchema = self;
    return T.array(self).whereby({ length: { max: 2 } });
  }).whereby({ depth: { max: 2 } });

  const built = new Fabricator(selfSchema);
  expect(() => built.fabricate()).toThrow(FabricatorError.DetachedSelfError);
  expect(() =>
    new Fabricator(selfSchema, built.trace).fabricate(),
  ).toThrow(FabricatorError.DetachedSelfError);
});

test("a [Fixed] field replayed from its own schema yields the drawn value, not the override", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-fixed-field",
    clock: "seeded",
  });

  const inner = T.number;
  const schema = T.object({ n: inner }).override({ n: 42 });
  const built = new Fabricator(schema);
  const field = built[Children].n!;

  expect(built.fabricate().n).toBe(42);
  expect(new Fabricator(inner, field.trace).fabricate()).not.toBe(42);
});

test("TraceKindMismatchError on a kind mismatch, and it is instanceof FabricatorError", () => {
  const { T, Fabricator } = initialize({
    seed: "trace-kind-mismatch",
    clock: "seeded",
  });

  let caught: unknown;
  try {
    new Fabricator(T.number, { kind: "string" });
  } catch (e) {
    caught = e;
  }

  expect(caught).toBeInstanceOf(FabricatorError);
  expect((caught as FabricatorError).name).toBe("TraceKindMismatchError");
});
