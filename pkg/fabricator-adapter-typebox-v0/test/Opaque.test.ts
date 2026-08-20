import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import { toTypeBox, typebox } from "@ghostry/fabricator-adapter-typebox-v0";

test("toTypeBox maps an opaque schema to Unknown", () => {
  const { T } = initialize({ seed: "opaque-typebox" });

  /**
   * `Unknown` rather than a throw: the adapter genuinely cannot constrain the
   * value, and throwing would break `toTypeBox` for any schema merely
   * _containing_ one. It emits no constraint keywords at all — only TypeBox's
   * own symbol-keyed `Kind`, which `Object.keys` excludes.
   */
  const schema = toTypeBox(T.opaque(() => new Map()));
  expect(Object.keys(schema)).toEqual([]);
  expect(Value.Check(schema, new Map())).toBe(true);
  expect(Value.Check(schema, "anything at all")).toBe(true);

  const object: any = toTypeBox(
    T.object({ id: T.always(1), payload: T.opaque(() => new Map()) }),
  );
  expect(object.type).toBe("object");
  expect(Object.keys(object.properties.payload)).toEqual([]);
});

test("an adaptation overrides the Unknown mapping", () => {
  const { T } = initialize({ seed: "opaque-adapt" });

  const adapted: any = toTypeBox(
    T.opaque(() => new Map<string, number>()).adapt(typebox, () =>
      Type.Object({}),
    ),
  );

  expect(adapted.type).toBe("object");
});
