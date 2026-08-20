import { expect, test } from "bun:test";
import {
  directoryOf,
  normalizeLocation,
  relativize,
} from "@ghostry/fabricator/internal";

/**
 * These three helpers exist to fold together spellings of one location that an
 * ordinary POSIX checkout can never produce on its own (a percent-encoded
 * `file://` URL, a Windows drive letter, a backslashed path) — so unlike the
 * rest of this package's test suite, which drives real behavior through real
 * stack frames, this file has to construct the inputs by hand.
 */

test("normalizeLocation converges a percent-encoded file:// URL with a decoded bare path", () => {
  const url = normalizeLocation("file:///Users/x/My%20Project/src/a.ts");
  const bare = normalizeLocation("/Users/x/My Project/src/a.ts");

  expect(url).toBe("/Users/x/My Project/src/a.ts");
  expect(url).toBe(bare);
});

test("normalizeLocation converges a Windows path and a Windows file:// URL, drive uppercased", () => {
  const backslashed = normalizeLocation("C:\\Users\\x\\a.ts");
  const url = normalizeLocation("file:///c:/Users/x/a.ts");

  expect(backslashed).toBe("/C:/Users/x/a.ts");
  expect(backslashed).toBe(url);
});

test("normalizeLocation never decodes a bare path, so a literal % survives", () => {
  expect(normalizeLocation("/tmp/100%_done/a.ts")).toBe("/tmp/100%_done/a.ts");
});

test("normalizeLocation decodes a file:// URL's escaped %, converging with the literal it represents", () => {
  expect(normalizeLocation("file:///tmp/100%25_done/a.ts")).toBe(
    "/tmp/100%_done/a.ts",
  );
});

test("normalizeLocation decodes multi-byte UTF-8 spanning several escapes", () => {
  expect(normalizeLocation("file:///Users/x/%E3%83%97%E3%83%AD/a.ts")).toBe(
    "/Users/x/プロ/a.ts",
  );
});

test("directoryOf keeps the trailing separator", () => {
  expect(directoryOf("/a/b/c.ts")).toBe("/a/b/");
});

test("directoryOf returns a non-path location unchanged", () => {
  expect(directoryOf("native")).toBe("native");
});

test("relativize descends into a root", () => {
  expect(relativize("/a/b/", "/a/b/c/d.ts")).toBe("c/d.ts");
});

test("relativize tolerates a root with no trailing slash", () => {
  expect(relativize("/a/b", "/a/b/c.ts")).toBe("c.ts");
});

test("relativize ascends with .. when the file sits outside the root", () => {
  expect(relativize("/a/b/", "/a/x/c.ts")).toBe("../x/c.ts");
});

/**
 * The exact class of bug `isOwnFrame`'s old `includes(OWN_ROOT)` had: `/a/bcd/`
 * merely shares a character prefix with `/a/b/`, but is not a descendant of it.
 * A correct implementation must ascend out and back in, never treat the
 * character overlap as a match.
 */
test("relativize does not mistake a sibling directory for a nested one", () => {
  expect(relativize("/a/b/", "/a/bcd/x.ts")).toBe("../bcd/x.ts");
});

test("relativize returns a non-absolute location unchanged, making it idempotent", () => {
  expect(relativize("/a/b/", "native")).toBe("native");
  expect(relativize("/a/b/", "../already/relative.ts")).toBe(
    "../already/relative.ts",
  );
});
