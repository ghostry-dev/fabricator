import { initialize, layer } from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * `clock` is what `T.date.past`/`T.date.future` (and any producer reading
 * `ProduceContext.clock`) resolve "now" against — an epoch-millisecond instant.
 * The unconfigured default is the wall-clock instant of `initialize()` itself;
 * `"derived"` is the explicit opt-in that derives that instant from the
 * instance salt instead.
 */

test("an unconfigured instance captures wall-clock time and an empty salt", () => {
  const before = Date.now();
  const instance = initialize();
  const after = Date.now();

  expect(instance.salt).toEqual([]);
  expect(instance.context.clock).toBeGreaterThanOrEqual(before);
  expect(instance.context.clock).toBeLessThanOrEqual(after);
});

test("an unconfigured instance replays from its captured clock alone", () => {
  const first = initialize();
  const run = new first.Fabricator(first.T.number).fabricate();

  const replay = initialize({
    salt: first.salt,
    clock: new Date(first.context.clock),
  });
  expect(new replay.Fabricator(replay.T.number).fabricate()).toBe(run);
});

test('clock: "derived" derives from the instance salt, not wall-clock time', () => {
  const a = initialize({ salt: "clock-derived", clock: "derived" });
  const b = initialize({ salt: "clock-derived", clock: "derived" });
  const c = initialize({ salt: "clock-derived-other", clock: "derived" });

  /** The same salt always derives the identical clock. */
  expect(a.context.clock).toBe(b.context.clock);
  /** A different salt derives a different clock. */
  expect(a.context.clock).not.toBe(c.context.clock);
  /**
   * Not wall-clock time: the derived instant is drawn across the whole
   * representable `Date` span, so it lands nowhere near the actual present.
   */
  expect(Math.abs(a.context.clock - Date.now())).toBeGreaterThan(
    1000 * 60 * 60 * 24 * 365,
  );
});

test("a salted clock re-derives when the salt it composes changes, while an explicit or default clock does not", () => {
  const salted = initialize({ salt: "clock-rederive-base", clock: "derived" });
  const forkedSeeded = salted.fork({ salt: layer("child") });

  /**
   * `fork({ salt: layer("child") })` composes onto the base's salt, so an
   * explicit `"derived"` clock — never resolved eagerly by `overlay()` — sees a
   * different effective salt and derives a different instant.
   */
  expect(forkedSeeded.context.clock).not.toBe(salted.context.clock);

  const wall = initialize({ salt: "clock-rederive-wall" });
  const forkedWall = wall.fork({ salt: layer("child") });
  /** A captured wall-clock instant is inherited as-is, like an explicit Date. */
  expect(forkedWall.context.clock).toBe(wall.context.clock);

  const explicit = initialize({
    salt: "clock-rederive-explicit",
    clock: new Date("2020-01-01T00:00:00.000Z"),
  });
  const forkedExplicit = explicit.fork({ salt: layer("child") });
  expect(forkedExplicit.context.clock).toBe(
    new Date("2020-01-01T00:00:00.000Z").getTime(),
  );
});

test('T.date.past replays identically across two initialize() calls sharing a salt and clock: "derived"', () => {
  const build = () => {
    const { T, Fabricator } = initialize({
      salt: "clock-replay",
      clock: "derived",
    });
    return new Fabricator(T.date.past);
  };

  const a = build();
  const b = build();

  for (let i = 0; i < 50; i++) {
    expect(a.fabricate()).toEqual(b.fabricate());
  }
});

test('T.date.past\'s bare and .whereby({ min }) forms agree on what "now" is', () => {
  const { T, Fabricator, context } = initialize({
    salt: "clock-bare-vs-whereby",
  });

  const now = context.clock;
  const bare = new Fabricator(T.date.past);
  const whereby = new Fabricator(
    T.date.past.whereby({ min: new Date(now - 1_000_000_000) }),
  );

  /**
   * `whereby`'s upper bound and the bare form both read this construction's
   * resolved clock — checked many draws apart, against the instance's own
   * resolved clock rather than a hardcoded instant.
   */
  for (let i = 0; i < 500; i++) {
    expect(bare.fabricate().getTime()).toBeLessThanOrEqual(now);
    expect(whereby.fabricate().getTime()).toBeLessThanOrEqual(now);
  }
});

test("initialize({ clock: new Date() }) pins every draw to that literal instant, not a later wall-clock read", () => {
  const before = Date.now();
  const { T, Fabricator, context } = initialize({
    salt: "clock-wall",
    clock: new Date(),
  });

  expect(context.clock).toBeGreaterThanOrEqual(before);

  const built = new Fabricator(T.date.future);
  const value = built.fabricate().getTime();

  /**
   * Bounded by the instant captured at `initialize()` time, not by whatever
   * `Date.now()` happens to read at each `fabricate()` call — there is no
   * per-call re-read left, since `clock` is a plain number now.
   */
  expect(value).toBeGreaterThanOrEqual(context.clock);
});

test("initialize({ clock: <fixed Date> }) pins every draw to that instant", () => {
  const pinned = new Date("1999-12-31T23:59:59.000Z");
  const { T, Fabricator } = initialize({
    salt: "clock-fixed-date",
    clock: pinned,
  });

  const built = new Fabricator(T.date.future.whereby({ max: new Date(2e12) }));

  for (let i = 0; i < 100; i++) {
    expect(built.fabricate().getTime()).toBeGreaterThanOrEqual(
      pinned.getTime(),
    );
  }
});

test("fork() inherits the parent instance's clock when not overridden", () => {
  const parent = initialize({
    salt: "clock-fork-inherit",
    clock: new Date(2020, 0, 1),
  });
  const child = parent.fork();

  const a = new parent.Fabricator(parent.T.date.future).fabricate();
  const b = new child.Fabricator(child.T.date.future).fabricate();

  /** Same clock, same salt lineage relationship a plain fork() preserves. */
  expect(a.getTime()).toBeGreaterThanOrEqual(new Date(2020, 0, 1).getTime());
  expect(b.getTime()).toBeGreaterThanOrEqual(new Date(2020, 0, 1).getTime());
  expect(child.context.clock).toBe(parent.context.clock);
});

test("fork({ clock }) overrides the parent's clock for the child instance only", () => {
  const parent = initialize({
    salt: "clock-fork-override",
    clock: new Date("2000-01-01T00:00:00.000Z"),
  });
  const child = parent.fork({ clock: new Date("2010-01-01T00:00:00.000Z") });

  const parentValue = new parent.Fabricator(
    parent.T.date.past.whereby({ min: new Date(0) }),
  ).fabricate();
  const childValue = new child.Fabricator(
    child.T.date.past.whereby({ min: new Date(0) }),
  ).fabricate();

  expect(parentValue.getTime()).toBeLessThanOrEqual(
    new Date("2000-01-01T00:00:00.000Z").getTime(),
  );
  expect(childValue.getTime()).toBeLessThanOrEqual(
    new Date("2010-01-01T00:00:00.000Z").getTime(),
  );
  /** The parent's own clock is untouched by the child's override. */
  expect(parent.context.clock).toBe(
    new Date("2000-01-01T00:00:00.000Z").getTime(),
  );
});

test("wrap({ clock }, ...) makes the override ambient for the extent of the block, then reverts", () => {
  const instance = initialize({
    salt: "clock-wrap",
    clock: new Date("2000-01-01T00:00:00.000Z"),
  });

  const wrappedValue = instance.wrap(
    { clock: new Date("2015-01-01T00:00:00.000Z") },
    () =>
      new instance.Fabricator(
        instance.T.date.past.whereby({ min: new Date(0) }),
      ).fabricate(),
  );

  expect(wrappedValue.getTime()).toBeLessThanOrEqual(
    new Date("2015-01-01T00:00:00.000Z").getTime(),
  );

  /** The instance's own clock reverts once the wrap exits. */
  const afterValue = new instance.Fabricator(
    instance.T.date.past.whereby({ min: new Date(0) }),
  ).fabricate();
  expect(afterValue.getTime()).toBeLessThanOrEqual(
    new Date("2000-01-01T00:00:00.000Z").getTime(),
  );
});

test("instance.context.clock is a live getter, reflecting an active wrap while it's active", () => {
  const instance = initialize({
    salt: "clock-context-live",
    clock: new Date("2000-01-01T00:00:00.000Z"),
  });

  expect(instance.context.clock).toBe(
    new Date("2000-01-01T00:00:00.000Z").getTime(),
  );

  instance.wrap({ clock: new Date("2021-01-01T00:00:00.000Z") }, () => {
    expect(instance.context.clock).toBe(
      new Date("2021-01-01T00:00:00.000Z").getTime(),
    );
  });

  expect(instance.context.clock).toBe(
    new Date("2000-01-01T00:00:00.000Z").getTime(),
  );
});

/**
 * `.as(produce)`'s `ProduceContext` also carries `clock` — this is what lets a
 * custom producer resolve "now" reproducibly too, the same guarantee `random`
 * already gives it. It arrives as a plain epoch-millisecond number, the same
 * representation everywhere else.
 */
test("ProduceContext.clock reaches a kind's own .as(produce)", () => {
  const pinned = new Date("2005-06-15T00:00:00.000Z");
  const { T, Fabricator } = initialize({
    salt: "clock-produce-context",
    clock: pinned,
  });

  const built = new Fabricator(
    T.string
      .whereby({ length: { max: 5 } })
      .as(({ clock }) => new Date(clock).toISOString()),
  );

  expect(built.fabricate()).toBe(pinned.toISOString());
});
