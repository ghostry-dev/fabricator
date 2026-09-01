import { en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { fakerExtension } from "@ghostry/fabricator-extension-faker-v10";
import { expect, test } from "bun:test";

/**
 * Faker inherits the instance's own `clock` rather than carrying a second,
 * independently configured one — the whole point being that `T.faker.date` and
 * core's own `T.date` never disagree about what "now" is within one schema.
 */

const types = () => registry.extend(fakerExtension({ locale: en }));

test('faker\'s date builder is pinned by clock: "derived", and replays across two initialize() calls', () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      salt: "faker-clock",
      clock: "derived",
      types: types(),
    });
    return new Fabricator(T.object({ past: T.faker.date.past() })).fabricate();
  };

  expect(build()).toEqual(build());
});

test("T.faker.date.past() and core's T.date.past agree on 'now' within the same schema", () => {
  const { T, Fabricator, context } = initialize({
    salt: "shared-now",
    types: types(),
  });

  const { corePast, fakerPast } = new Fabricator(
    T.object({
      corePast: T.date.past,
      fakerPast: T.faker.date.past({ years: 1 }),
    }),
  ).fabricate();

  expect(corePast.getTime()).toBeLessThanOrEqual(context.clock);
  expect(fakerPast.getTime()).toBeLessThanOrEqual(context.clock);
});

test("initialize({ clock }) pins faker's reference date to that explicit instant", () => {
  const clock = new Date("2011-02-03T04:05:06.007Z");

  const build = () => {
    const { T, Fabricator } = initialize({
      salt: "pinned-clock",
      clock,
      types: types(),
    });
    return new Fabricator(
      T.object({ past: T.faker.date.past({ years: 1 }) }),
    ).fabricate();
  };

  const a = build();
  const b = build();

  expect(a).toEqual(b);
  expect(a.past.getTime()).toBeLessThanOrEqual(clock.getTime());
});

test("wrap({ clock }, ...) makes the override reach faker builders for the extent of the block", () => {
  const { T, Fabricator, wrap, context } = initialize({
    salt: "wrap-clock",
    types: types(),
  });
  const built = new Fabricator(
    T.object({ past: T.faker.date.past({ years: 1 }) }),
  );

  const wrapClock = new Date("1999-12-31T23:59:59.000Z");

  const inside = wrap({ clock: wrapClock }, ({ Fabricator: Scoped }) =>
    new Scoped(T.object({ past: T.faker.date.past({ years: 1 }) })).fabricate(),
  );

  expect(inside.past.getTime()).toBeLessThanOrEqual(wrapClock.getTime());
  expect(built.fabricate().past.getTime()).toBeLessThanOrEqual(context.clock);
});
