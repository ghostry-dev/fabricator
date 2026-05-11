import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";

test("a computed field's resolver returning a value matching its source's kind fabricates normally", () => {
  const { T, Fabricator } = initialize({ seed: "compute-valid" });

  const schema = T.object({ createdAt: T.date }).refine(({ compute }) => ({
    day: compute(T.date).as(({ fabricated }) => fabricated.createdAt),
  }));

  const result = new Fabricator(schema).fabricate();

  expect(result.day).toEqual(result.createdAt);
});

test("a computed field's resolver returning a value that violates its source's declared kind throws at fabricate() time", () => {
  const { T, Fabricator } = initialize({ seed: "compute-invalid" });

  const schema = T.object({ createdAt: T.date }).refine(({ compute }) => ({
    // A bug: declares a `date` source but the resolver actually returns a
    // string — TS's `Resolved<$Source>` would normally catch this at the
    // call site, but the cast bypasses it, so this must be caught at
    // runtime instead.
    day: compute(T.date).as(() => "not-a-date" as unknown as Date),
  }));

  expect(() => new Fabricator(schema).fabricate()).toThrow();
});
