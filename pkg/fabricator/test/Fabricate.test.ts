import {
  FabricatorError,
  Omitted,
  initialize,
  layer,
} from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * The equivalence `fabricate` promises: repeated calls with one schema object
 * are successive `.fabricate()` calls on the one Fabricator its first call
 * built — at the ordinal that first call took.
 */
test("repeated fabricate(schema) continues one Fabricator", () => {
  const viaFabricate = initialize({ salt: "fabricate-same", clock: "derived" });
  const viaBuild = initialize({ salt: "fabricate-same", clock: "derived" });

  const S = viaFabricate.T.number;
  const drawn = [
    viaFabricate.fabricate(S),
    viaFabricate.fabricate(S),
    viaFabricate.fabricate(S),
  ];

  const built = new viaBuild.Fabricator(viaBuild.T.number);
  const expected = [built.fabricate(), built.fabricate(), built.fabricate()];

  expect(drawn).toEqual(expected);
  expect(new Set(drawn).size).toBe(3);
});

test("repeated fabricate(schema) takes one construction ordinal, however many calls", () => {
  const instance = initialize({ salt: "fabricate-ordinal" });
  const { T, fabricate, Fabricator } = instance;

  const B = T.boolean;
  for (let i = 0; i < 10; i++) fabricate(B);

  expect(new Fabricator(T.number).trace.ordinal).toBe(1);
});

/**
 * Identity is the key, so two structurally equal schema objects are two builds
 * — the inline `.whereby(...)` / `.override(...)` cost the docs name. A bare
 * registry entry is inline too: every read of `T.number` is a fresh Schema.
 */
test("structurally equal but distinct schema objects each build", () => {
  const instance = initialize({ salt: "fabricate-identity" });
  const { T, fabricate, Fabricator } = instance;

  fabricate(T.string.whereby({ length: 4 }));
  fabricate(T.string.whereby({ length: 4 }));
  fabricate(T.number);
  fabricate(T.number);

  expect(new Fabricator(T.number).trace.ordinal).toBe(4);
});

test("an override held in a variable is reused; one written inline builds every call", () => {
  const instance = initialize({ salt: "fabricate-override" });
  const { T, fabricate, Fabricator } = instance;

  const Obj = T.object({ f: T.omittable(T.number), g: T.number });
  const Off = Obj.override({ f: Omitted });

  const saved = [fabricate(Off), fabricate(Off), fabricate(Off)];
  for (const value of saved) expect("f" in value).toBe(false);
  expect(new Set(saved.map((value) => value.g)).size).toBe(3);
  expect(new Fabricator(T.number).trace.ordinal).toBe(1);

  const inline = [
    fabricate(Obj.override({ f: Omitted })),
    fabricate(Obj.override({ f: Omitted })),
  ];
  for (const value of inline) expect("f" in value).toBe(false);
  expect(new Fabricator(T.number).trace.ordinal).toBe(4);
});

test("anything but a Schema is rejected, at the type and at runtime", () => {
  const { T, fabricate, Fabricator } = initialize({
    salt: "fabricate-argument",
  });

  const built = new Fabricator(T.number);

  // @ts-expect-error a built Fabricator is not a Schema
  expect(() => fabricate(built)).toThrow(
    FabricatorError.FabricateArgumentError,
  );
  // @ts-expect-error a bare builder still needs `.whereby(...)`
  expect(() => fabricate(T.array(T.number))).toThrow(
    FabricatorError.FabricateArgumentError,
  );
  // @ts-expect-error carries `[Kind]`, but no `[Meta]` until `.whereby(...)`
  expect(() => fabricate(T.string)).toThrow(
    FabricatorError.FabricateArgumentError,
  );
  // @ts-expect-error carries `[Kind]`, but no `[Meta]` until `.whereby(...)`
  expect(() => fabricate(T.bigint)).toThrow(
    FabricatorError.FabricateArgumentError,
  );
  // @ts-expect-error not a schema at all
  expect(() => fabricate({ name: "x" })).toThrow(
    FabricatorError.FabricateArgumentError,
  );
  // @ts-expect-error not a schema at all
  expect(() => fabricate(undefined)).toThrow(
    FabricatorError.FabricateArgumentError,
  );
});

/**
 * The `fabricate` twin of `Wrap.test.ts`'s first test: the receiver and the
 * wrap's scope resolve the same frame source, so they must reach one cached
 * Fabricator — not two, each with its own sequence.
 */
test("inside a wrap, instance.fabricate and scope.fabricate continue one Fabricator", () => {
  const instance = initialize({ salt: "fabricate-wrap-shared" });
  const S = instance.T.number;

  const interleaved = instance.wrap({ salt: layer("x") }, (scope) => [
    instance.fabricate(S),
    scope.fabricate(S),
    instance.fabricate(S),
  ]);

  const allViaScope = instance.wrap({ salt: layer("x") }, (scope) => [
    scope.fabricate(S),
    scope.fabricate(S),
    scope.fabricate(S),
  ]);

  expect(interleaved).toEqual(allViaScope);
});

/**
 * The reason the cache is keyed by source: each wrap is a fresh source, so a
 * module-level schema does not carry its stream from one scope into the next.
 */
test("each wrap starts its own cache, so two identical wraps reproduce each other", () => {
  const instance = initialize({ salt: "fabricate-wrap-fresh" });
  const S = instance.T.number;

  const outside = instance.fabricate(S);

  const first = instance.wrap({ salt: layer("x") }, () => [
    instance.fabricate(S),
    instance.fabricate(S),
  ]);
  const second = instance.wrap({ salt: layer("x") }, () => [
    instance.fabricate(S),
    instance.fabricate(S),
  ]);

  expect(first).toEqual(second);

  const fresh = initialize({
    salt: "fabricate-wrap-fresh",
    clock: instance.context.clock,
  });
  const forked = fresh.fork({ salt: layer("x") });
  expect(first[0]).toBe(forked.fabricate(forked.T.number));

  expect(instance.fabricate(S)).not.toBe(outside);
  expect(new instance.Fabricator(S).trace.ordinal).toBe(1);
});

test("a fork does not continue its parent's cache", () => {
  const instance = initialize({ salt: "fabricate-fork", clock: "derived" });
  const S = instance.T.number;

  instance.fabricate(S);
  const forked = instance.fork();

  const replay = initialize({ salt: "fabricate-fork", clock: "derived" });
  expect(forked.fabricate(S)).toBe(replay.fabricate(replay.T.number));
});
