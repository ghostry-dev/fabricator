import * as faker from "@faker-js/faker";
import { base, en } from "@faker-js/faker";
import { initialize, registry } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";
import {
  FakerExtensionError,
  fakerExtension,
  type Options,
} from "@ghostry/fabricator-extension-faker-v10";
import { interceptLoad } from "#internal/Load/Sync";
import { expect, test } from "./index.ts";

/**
 * Runs `block` with every faker load routed through `substitute` (the real
 * loader when omitted), and returns how many loads it saw.
 */
function countLoads(
  block: () => void,
  substitute?: () => typeof faker,
): number {
  let loads = 0;
  const restore = interceptLoad((load) => {
    loads++;
    return substitute ? substitute() : load();
  });
  try {
    block();
  } finally {
    restore();
  }
  return loads;
}

test("building and adapting schemas never loads faker; the first draw does, once", () => {
  const { T, Fabricator } = initialize({
    clock: "derived",
    types: registry.extend(fakerExtension({ locale: ["base", "en"] })),
  });

  let user: { fabricate: () => unknown } | undefined;
  const beforeDraw = countLoads(() => {
    const User = T.object({
      name: T.faker.person.fullName(),
      bio: T.faker.lorem.paragraph(),
      color: T.faker.color.rgb.channels(),
    });
    toTypeBox(User);
    user = new Fabricator(User);
  });
  expect(beforeDraw).toBe(0);

  const drawing = countLoads(() => {
    user!.fabricate();
    user!.fabricate();
    new Fabricator(T.faker.word.noun()).fabricate();
    new Fabricator(T.faker.use.string((f) => f.person.firstName())).fabricate();
  });
  expect(drawing).toBe(1);
});

test("each fakerExtension call loads for itself", () => {
  const loads = countLoads(() => {
    for (const salt of ["a", "b"]) {
      const { T, Fabricator } = initialize({
        salt,
        clock: "derived",
        types: registry.extend(fakerExtension({ locale: "en" })),
      });
      new Fabricator(T.faker.person.firstName()).fabricate();
    }
  });

  expect(loads).toBe(2);
});

test("a failed instance is not kept: the next draw loads again", () => {
  const { T, Fabricator } = initialize({
    clock: "derived",
    types: registry.extend(fakerExtension({ locale: ["base", "en"] })),
  });
  const name = new Fabricator(T.faker.person.firstName());

  const loads = countLoads(
    () => {
      expect(() => name.fabricate()).toThrow(
        FakerExtensionError.UnknownLocaleError,
      );
      expect(() => name.fabricate()).toThrow(
        FakerExtensionError.UnknownLocaleError,
      );
    },
    () => ({ ...faker, allLocales: {} as typeof faker.allLocales }),
  );
  expect(loads).toBe(2);

  expect(typeof name.fabricate()).toBe("string");
});

test("an unknown locale name throws at the first draw, naming it", () => {
  const { T, Fabricator } = initialize({
    clock: "derived",
    types: registry.extend(
      fakerExtension({ locale: ["nope"] } as unknown as Options),
    ),
  });

  expect(() => new Fabricator(T.faker.person.firstName()).fabricate()).toThrow(
    /"nope"/,
  );
});

test("a create instance is built at the call and never loads faker", () => {
  let built = 0;

  const loads = countLoads(() => {
    const { T, Fabricator } = initialize({
      clock: "derived",
      types: registry.extend(
        fakerExtension({
          create: (randomizer) => {
            built++;
            return new faker.Faker({ locale: [base, en], randomizer });
          },
        }),
      ),
    });
    expect(built).toBe(1);

    expect(typeof new Fabricator(T.faker.person.firstName()).fabricate()).toBe(
      "string",
    );
  });

  expect(loads).toBe(0);
});

test.each([
  { names: ["base", "en"], objects: [base, en] },
  { names: ["en"], objects: [en] },
] as const)(
  "naming locales draws exactly what passing their objects does",
  ({ row: { names, objects } }) => {
    const draw = (locale: Options["locale"] & {}) => {
      const { T, Fabricator } = initialize({
        salt: "names",
        clock: "derived",
        types: registry.extend(fakerExtension({ locale })),
      });
      const fabricator = new Fabricator(
        T.object({
          name: T.faker.person.fullName(),
          city: T.faker.location.city(),
          words: T.faker.lorem.words(5),
          past: T.faker.date.past(),
        }),
      );
      return [fabricator.fabricate(), fabricator.fabricate()];
    };

    expect(draw(names)).toEqual(draw(objects));
  },
);
