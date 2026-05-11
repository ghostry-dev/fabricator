import { en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { expect, test } from "bun:test";

/**
 * The whole premise of the bridge: a faker builder draws through the same
 * seeded stream every other kind does, so it is exactly as reproducible.
 */

const types = () => registry.extend(fakerExtension({ locale: en }));

test("identical seed produces identical output over many iterations", () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      seed: "reproducibility",
      clock: "seeded",
      types: types(),
    });
    return new Fabricator(
      T.object({
        name: T.faker.person.fullName(),
        email: T.faker.internet.email(),
        age: T.faker.number.int({ min: 0, max: 120 }),
        active: T.faker.datatype.boolean(),
      }),
    );
  };

  const a = build();
  const b = build();

  for (let i = 0; i < 50; i++) {
    expect(b.fabricate()).toEqual(a.fabricate());
  }
});

test("different seeds produce different output", () => {
  const clock = new Date("2020-01-01T00:00:00.000Z");
  const { T: T1, Fabricator: F1 } = initialize({
    seed: "seed-a",
    clock,
    types: types(),
  });
  const a = new F1(T1.object({ name: T1.faker.person.fullName() })).fabricate();

  const { T: T2, Fabricator: F2 } = initialize({
    seed: "seed-b",
    clock,
    types: types(),
  });
  const b = new F2(T2.object({ name: T2.faker.person.fullName() })).fabricate();

  expect(a.name).not.toBe(b.name);
});

test("one built Fabricator's repeated fabricate() advances the stream, but a rebuild replays it", () => {
  const seed = "advance-and-replay";

  const { T: T1, Fabricator: F1 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const built1 = new F1(T1.object({ name: T1.faker.person.fullName() }));
  const first = built1.fabricate();
  const second = built1.fabricate();
  expect(second.name).not.toBe(first.name);

  const { T: T2, Fabricator: F2 } = initialize({
    seed,
    clock: "seeded",
    types: types(),
  });
  const built2 = new F2(T2.object({ name: T2.faker.person.fullName() }));
  expect(built2.fabricate()).toEqual(first);
  expect(built2.fabricate()).toEqual(second);
});
