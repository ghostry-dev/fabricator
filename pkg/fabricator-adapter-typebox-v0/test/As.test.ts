import { expect, test } from "bun:test";
import { initialize } from "@ghostry/fabricator";
import { toTypeBox } from "@ghostry/fabricator-adapter-typebox-v0";

test("`toTypeBox(...)` on a produce-based `array`/`object` schema still yields the structural shape", () => {
  const { T } = initialize({ seed: "as-typebox" });

  const arraySchema = T.array(T.number).as(() => [1, 2, 3]);
  const arrayTypeBox = toTypeBox(arraySchema);
  expect(arrayTypeBox.type).toBe("array");
  expect(arrayTypeBox.items.type).toBe("number");

  const objectSchema = T.object({ x: T.number }).as(() => ({ x: 1 }));
  const objectTypeBox = toTypeBox(objectSchema);
  expect(objectTypeBox.type).toBe("object");
  expect(objectTypeBox.properties.x.type).toBe("number");
});
