import { Faker, en, faker as globalFaker } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import {
  FakerExtensionError,
  fakerExtension,
} from "@ghostry/fabricator-extension-faker-v10";
import { expect, test } from "bun:test";

/**
 * The bridge's shared `scope` is a module-level mutable — these tests are
 * the guard that it never leaks across unrelated fabrications, or is
 * confused with faker's own global singleton.
 */

const types = () => registry.extend(fakerExtension({ locale: en }));

test("draining the global faker singleton between two identical builds does not perturb fabricator's own output", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "isolation",
      clock: "seeded",
      types: types(),
    });
    return new Fabricator(
      T.object({ name: T.faker.person.fullName() }),
    ).fabricate();
  };

  const before = build();

  globalFaker.seed(12345);
  for (let i = 0; i < 25; i++) globalFaker.person.fullName();

  const after = build();

  expect(after).toEqual(before);
});

test("two initialize() calls sharing one namespace don't perturb each other", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const { T: T1, Fabricator: F1 } = initialize({
    seed: "instance-a",
    clock,
    types: types(),
  });
  const built1 = new F1(T1.object({ name: T1.faker.person.fullName() }));

  const { T: T2, Fabricator: F2 } = initialize({
    seed: "instance-b",
    clock,
    types: types(),
  });
  const built2 = new F2(T2.object({ name: T2.faker.person.fullName() }));

  const a1 = built1.fabricate();
  const b1 = built2.fabricate();
  const a2 = built1.fabricate();
  const b2 = built2.fabricate();

  expect(a1).not.toEqual(b1);
  expect(a1).not.toEqual(a2);
  expect(b1).not.toEqual(b2);
});

test("a nested initialize()/fabricate() reached from an ordinary field's producer leaves the enclosing object's own faker fields unaffected", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "nested",
      clock: "seeded",
      types: types(),
    });

    const nested = T.string.as(() => {
      const { T: innerT, Fabricator: InnerFabricator } = initialize({
        seed: "nested-inner",
        clock: "seeded",
        types: types(),
      });
      return new InnerFabricator(innerT.faker.person.fullName()).fabricate();
    });

    return new Fabricator(
      T.object({
        outer: T.faker.person.fullName(),
        inner: nested,
        afterNesting: T.faker.internet.email(),
      }),
    ).fabricate();
  };

  const a = build();
  const b = build();

  expect(a).toEqual(b);
  expect(typeof a.outer).toBe("string");
  expect(typeof a.inner).toBe("string");
  expect(a.afterNesting).toContain("@");
});

test("calling the bridged faker instance directly, outside of fabricate(), throws NoActiveScopeError", () => {
  let handle: Faker | undefined;

  registry.extend(
    fakerExtension({
      create: (randomizer) => {
        handle = new Faker({ locale: en, randomizer });
        return handle;
      },
    }),
  );

  expect(() => handle!.person.fullName()).toThrow(
    FakerExtensionError.NoActiveScopeError,
  );
});
