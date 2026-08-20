import { FabricatorError, initialize } from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * These four tests assert boundedness relative to "now" — under the default
 * wall-clock, that means whatever instant `instance.context.clock` captured at
 * `initialize()`, not a later `Date.now()` (see `Clock.test.ts` for the clock
 * mechanism itself). Asserting against `context.clock` directly is what these
 * tests actually mean, and it's exact.
 */
test("T.date.past always lands at or before now", () => {
  const { T, Fabricator, context } = initialize({ seed: "date-past" });

  const built = new Fabricator(T.date.past);
  const now = context.clock;

  for (let i = 0; i < 2000; i++) {
    expect(built.fabricate().getTime()).toBeLessThanOrEqual(now);
  }
});

test("T.date.future always lands at or after now", () => {
  const { T, Fabricator, context } = initialize({ seed: "date-future" });

  const built = new Fabricator(T.date.future);
  const now = context.clock;

  for (let i = 0; i < 2000; i++) {
    expect(built.fabricate().getTime()).toBeGreaterThanOrEqual(now);
  }
});

/**
 * These two pin an explicit `clock` inside the `min`/`max` window, rather than
 * relying on the instance's captured "now": a wall-clock default near the
 * actual present would sit outside a historical calendar window like this one,
 * making `[min, now]`/`[now, max]` an invalid (inverted) range.
 */
test("T.date.past.whereby({ min }) stays within [min, now]", () => {
  const min = new Date("2020-01-01T00:00:00.000Z");
  const now = new Date("2025-01-01T00:00:00.000Z");
  const { T, Fabricator } = initialize({
    seed: "date-past-whereby",
    clock: now,
  });

  const built = new Fabricator(T.date.past.whereby({ min }));

  for (let i = 0; i < 2000; i++) {
    const value = built.fabricate().getTime();
    expect(value).toBeGreaterThanOrEqual(min.getTime());
    expect(value).toBeLessThanOrEqual(now.getTime());
  }
});

test("T.date.future.whereby({ max }) stays within [now, max]", () => {
  const now = new Date("2025-01-01T00:00:00.000Z");
  const max = new Date("2030-01-01T00:00:00.000Z");
  const { T, Fabricator } = initialize({
    seed: "date-future-whereby",
    clock: now,
  });

  const built = new Fabricator(T.date.future.whereby({ max }));

  for (let i = 0; i < 2000; i++) {
    const value = built.fabricate().getTime();
    expect(value).toBeGreaterThanOrEqual(now.getTime());
    expect(value).toBeLessThanOrEqual(max.getTime());
  }
});

/**
 * Inclusive dates are sampled as continuous epoch ms and then clipped to a
 * whole millisecond by the `Date` constructor, so — like a continuous
 * `T.number.whereby({ min, max })` — an exact draw of either endpoint isn't the
 * right thing to assert; approach from within an epsilon of each bound instead.
 * Exclusive ends resolve as discrete milliseconds first (`TimeClip` would
 * otherwise land back on the excluded instant).
 */
test("T.date.whereby({ min, max }) stays within [min, max] and approaches both ends", () => {
  const { T, Fabricator } = initialize({ seed: "date-whereby-bounds" });

  const min = new Date("2000-01-01T00:00:00.000Z");
  const max = new Date("2000-01-01T00:16:40.000Z"); // 1,000,000ms span
  const built = new Fabricator(T.date.whereby({ min, max }));

  const span = max.getTime() - min.getTime();
  const epsilon = span * 1e-3;

  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 20000; i++) {
    const value = built.fabricate().getTime();
    expect(value).toBeGreaterThanOrEqual(min.getTime());
    expect(value).toBeLessThanOrEqual(max.getTime());
    if (value - min.getTime() < epsilon) sawMin = true;
    if (max.getTime() - value < epsilon) sawMax = true;
  }

  expect(sawMin).toBe(true);
  expect(sawMax).toBe(true);
});

test("an exclusive date min is never produced", () => {
  const { T, Fabricator } = initialize({ seed: "date-exclusive-min" });
  const min = new Date("2000-01-01T00:00:00.000Z");
  const max = new Date("2000-01-01T00:00:01.000Z");
  const built = new Fabricator(
    T.date.whereby({ min: { value: min, exclusive: true }, max }),
  );

  for (let i = 0; i < 5000; i++) {
    const value = built.fabricate().getTime();
    expect(value).toBeGreaterThan(min.getTime());
    expect(value).toBeLessThanOrEqual(max.getTime());
  }
});

test("an empty date range throws at whereby", () => {
  const { T } = initialize({ seed: "date-empty" });
  const at = new Date("2000-01-01T00:00:00.000Z");
  expect(() =>
    T.date.whereby({ min: at, max: { value: at, exclusive: true } }),
  ).toThrow(FabricatorError.EmptyRangeError);
});

/** A bare `T.date` spans the entire representable range, both sides of now. */
test("a bare T.date spans both past and future", () => {
  const { T, Fabricator } = initialize({ seed: "date-bare" });

  const built = new Fabricator(T.date);
  const now = Date.now();

  let past = 0;
  let future = 0;
  for (let i = 0; i < 2000; i++) {
    const value = built.fabricate().getTime();
    if (value < now) past++;
    else future++;
  }

  expect(past).toBeGreaterThan(0);
  expect(future).toBeGreaterThan(0);
});
