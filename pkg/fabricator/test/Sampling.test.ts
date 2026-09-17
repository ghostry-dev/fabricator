import {
  FabricatorError,
  initialize,
  sample,
  shuffle,
} from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * `sample`/`shuffle` are public so a producer that already holds a `Stream` can
 * draw from a caller-held list. These pin that contract through the public
 * `T.opaque(({ random }) => ...)` path — the only way an ordinary caller
 * obtains a stream.
 *
 * @module
 */

test("sample returns a member, and every member appears across enough draws", () => {
  const { T, Fabricator } = initialize({ salt: "sample-members" });
  const list = ["a", "b", "c"] as const;
  const built = new Fabricator(T.opaque(({ random }) => sample(list, random)));

  const seen = new Set<string>();
  for (let i = 0; i < 100 && seen.size < 3; i++) seen.add(built.fabricate());

  expect(seen).toEqual(new Set(["a", "b", "c"]));
});

test("sample replays under the same salt and clock", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      salt: "sample-reproducible",
      clock: "derived",
    });
    return new Fabricator(
      T.opaque(({ random }) => sample(["a", "b", "c"], random)),
    );
  };

  const a = build();
  const b = build();

  for (let i = 0; i < 50; i++) {
    expect(a.fabricate()).toBe(b.fabricate());
  }
});

test("sample([]) throws a FabricatorError named EmptyItemsError", () => {
  const { T, Fabricator } = initialize({ salt: "sample-empty" });
  const empty: string[] = [];
  const built = new Fabricator(T.opaque(({ random }) => sample(empty, random)));

  let caught: unknown;
  try {
    built.fabricate();
  } catch (e) {
    caught = e;
  }

  expect(caught).toBeInstanceOf(FabricatorError);
  expect((caught as Error).name).toBe("EmptyItemsError");
});

test("shuffle returns a permutation, does not mutate its input, and replays under salt", () => {
  const items = ["a", "b", "c", "d"];
  const snapshot = [...items];

  const build = () => {
    const { T, Fabricator } = initialize({
      salt: "shuffle-reproducible",
      clock: "derived",
    });
    return new Fabricator(T.opaque(({ random }) => shuffle(items, random)));
  };

  const a = build();
  const b = build();
  const shuffled = a.fabricate();

  expect(items).toEqual(snapshot);
  expect(shuffled).not.toBe(items);
  expect([...shuffled].sort()).toEqual(["a", "b", "c", "d"]);
  expect(shuffled).toEqual(b.fabricate());

  for (let i = 0; i < 20; i++) {
    expect(a.fabricate()).toEqual(b.fabricate());
  }
});
