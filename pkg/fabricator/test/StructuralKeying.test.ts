import { initialize } from "@ghostry/fabricator";
import { expect, test } from "bun:test";

/**
 * The property structural (schema-path) keying exists for: a leaf's stream
 * is identified by its own position in the schema — a field name, a tuple
 * slot index, a choice option index — never by how many same-kind leaves
 * were dispatched before it in the same file.
 */

test("inserting a field leaves every existing sibling's value unchanged", () => {
  const seed = "insert-field";

  const { T: T1, Fabricator: F1 } = initialize({ seed, clock: "seeded" });
  const before = new F1(
    T1.object({
      name: T1.string.whereby({ length: { max: 8 } }),
      age: T1.number,
    }),
  ).fabricate();

  const { T: T2, Fabricator: F2 } = initialize({ seed, clock: "seeded" });
  const after = new F2(
    T2.object({
      id: T2.string.whereby({ length: { max: 8 } }),
      name: T2.string.whereby({ length: { max: 8 } }),
      age: T2.number,
    }),
  ).fabricate();

  expect(after.name).toBe(before.name);
  expect(after.age).toBe(before.age);
});

test("reordering fields leaves every field's own value unchanged", () => {
  const seed = "reorder-fields";

  const { T: T1, Fabricator: F1 } = initialize({ seed, clock: "seeded" });
  const forward = new F1(
    T1.object({
      name: T1.string.whereby({ length: { max: 8 } }),
      age: T1.number,
    }),
  ).fabricate();

  const { T: T2, Fabricator: F2 } = initialize({ seed, clock: "seeded" });
  const reversed = new F2(
    T2.object({
      age: T2.number,
      name: T2.string.whereby({ length: { max: 8 } }),
    }),
  ).fabricate();

  expect(reversed.name).toBe(forward.name);
  expect(reversed.age).toBe(forward.age);
});

test("renaming a field changes only that field's own value, not its siblings'", () => {
  const seed = "rename-field";

  const { T: T1, Fabricator: F1 } = initialize({ seed, clock: "seeded" });
  const original = new F1(
    T1.object({
      name: T1.string.whereby({ length: { max: 8 } }),
      age: T1.number,
    }),
  ).fabricate();

  const { T: T2, Fabricator: F2 } = initialize({ seed, clock: "seeded" });
  const renamed = new F2(
    T2.object({
      fullName: T2.string.whereby({ length: { max: 8 } }),
      age: T2.number,
    }),
  ).fabricate();

  expect(renamed.age).toBe(original.age);
  /** The renamed field itself draws independently — a new path, new data. */
  expect(renamed.fullName).not.toBe(original.name);
});

/**
 * `Constructor.ts`'s `choice` branch dispatches its options via `.map`,
 * which would misattribute every option's randomness under the old
 * call-stack-based design (a native `Array.prototype.map` frame sits
 * between the two calls, collapsing every option onto one shared
 * `"native"` bucket) — structural path keying never reads the call stack
 * per leaf, so this is safe regardless. Adding an option to one field must
 * not perturb an unrelated sibling field's own draws, the same "no
 * disturb" property every other composite kind (`object`, `tuple`) is held
 * to.
 */
test("adding a choice option leaves an unrelated sibling field's draws unchanged", () => {
  const seed = "choice-add-option";

  const { T: T1, Fabricator: F1 } = initialize({ seed, clock: "seeded" });
  const before = new F1(
    T1.object({
      pick: T1.choice.uniform([
        T1.string.whereby({ length: { max: 5 } }),
        T1.number,
      ]),
      sibling: T1.number,
    }),
  );

  const { T: T2, Fabricator: F2 } = initialize({ seed, clock: "seeded" });
  const after = new F2(
    T2.object({
      pick: T2.choice.uniform([
        T2.string.whereby({ length: { max: 5 } }),
        T2.number,
        T2.boolean,
      ]),
      sibling: T2.number,
    }),
  );

  for (let i = 0; i < 20; i++) {
    expect(after.fabricate().sibling).toBe(before.fabricate().sibling);
  }
});
