import {
  directoryOf,
  normalizeLocation,
  relativize,
  resolveCallerFile,
} from "@ghostry/fabricator/internal";
import { expect, test } from "bun:test";
import {
  resolveFromWrapper,
  resolveFromWrapperEmptySkip,
  resolveFromWrapperUnskipped,
} from "./fixtures/wrapper";
import { relayToWrapper, relayToWrapperUnskipped } from "./relay/relay";

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
 * The exact class of bug `isInternalFrame`'s old `includes(OWN_ROOT)` had:
 * `/a/bcd/` merely shares a character prefix with `/a/b/`, but is not a
 * descendant of it. A correct implementation must ascend out and back in, never
 * treat the character overlap as a match.
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

/**
 * `resolveCallerFile` drives real behavior through a real stack —
 * `test/fixtures/ wrapper.ts` stands in for a library (e.g. `@ghostry/extern`'s
 * testing scope) sitting between fabricator and the real caller, so the stack
 * these tests exercise is genuinely fabricator → wrapper → this file, not a
 * synthetic one.
 */

test("resolveCallerFile with no options stops at this test file", () => {
  expect(resolveCallerFile({ root: new URL(".", import.meta.url).href })).toBe(
    "CallSite.test.ts",
  );
});

/**
 * The contrasting case, establishing why `skip` is needed at all: with no
 * `skip`, `resolveCallerFile` only excludes fabricator's own frames, so a call
 * relayed through a wrapper resolves no further than the wrapper itself.
 */
test("resolveCallerFile with no skip stops at the first non-fabricator frame — the wrapper, not its caller", () => {
  const wrapperRoot = new URL("./fixtures/", import.meta.url).href;
  expect(resolveFromWrapperUnskipped({ root: wrapperRoot })).toBe("wrapper.ts");
});

/**
 * `skip` must be _additive_ to fabricator's own root, not a replacement for it:
 * with a wrapper between fabricator and the real caller, the frames are
 * fabricator → wrapper → this file. If `skip` replaced `OWN_ROOT` instead of
 * composing onto it, this would resolve to fabricator's own internal frame
 * rather than skipping past both fabricator _and_ the wrapper to reach here.
 */
test("resolveCallerFile's skip is additive: excludes the wrapper in addition to fabricator's own frames", () => {
  const here = new URL(".", import.meta.url).href;
  expect(resolveFromWrapper({ root: here })).toBe("CallSite.test.ts");
});

/**
 * The two-wrapper chain, the shape a fabricator integration that is itself
 * consumed through another library produces: the frames read fabricator →
 * wrapper → relay → this file. Both wrapper roots have to be in the skip set
 * for resolution to reach the caller, which is why `skip` takes a list.
 */
test("resolveCallerFile's skip accepts a list, excluding every root in a wrapper chain", () => {
  const here = new URL(".", import.meta.url).href;

  expect(relayToWrapper({ root: here })).toBe("CallSite.test.ts");
});

/**
 * The contrast that gives the test above its teeth: with only the inner
 * wrapper's root skipped, resolution stops at the outer wrapper. The two
 * fixtures live in sibling directories precisely so this can differ — a nested
 * fixture would be covered by the inner root and both cases would pass.
 */
test("resolveCallerFile with an incomplete skip list stops at the first unlisted wrapper", () => {
  const relayRoot = new URL("./relay/", import.meta.url).href;

  expect(relayToWrapperUnskipped({ root: relayRoot })).toBe("relay.ts");
});

/**
 * An empty list and an omitted `skip` have to mean the same thing — `[]` is a
 * spelling that only became expressible when `skip` became a list.
 */
test("resolveCallerFile's skip treats an empty list as no skip at all", () => {
  const wrapperRoot = new URL("./fixtures/", import.meta.url).href;

  expect(resolveFromWrapperEmptySkip({ root: wrapperRoot })).toBe(
    resolveFromWrapperUnskipped({ root: wrapperRoot }),
  );
  expect(resolveFromWrapperEmptySkip({ root: wrapperRoot })).toBe("wrapper.ts");
});

/**
 * The fallback branch, for engines without `Error.captureStackTrace` — no
 * runtime this suite runs on takes it, so the capability has to be removed to
 * reach it at all. Asserts the two properties that distinguish this path: the
 * whole multi-line stack is returned rather than one isolated frame, and `root`
 * cannot relativize it, since a multi-line stack is not an absolute path and
 * falls through `relativize`'s passthrough.
 */
test("resolveCallerFile falls back to the whole stack when captureStackTrace is unavailable", () => {
  const original = Error.captureStackTrace;
  const here = new URL(".", import.meta.url).href;

  try {
    Error.captureStackTrace = undefined as never;

    const site = resolveCallerFile();

    expect(site).toContain("\n");
    expect(site).not.toMatch(/:\d+:\d+/);
    expect(resolveCallerFile({ root: here })).toContain("\n");
  } finally {
    Error.captureStackTrace = original;
  }
});

test("resolveCallerFile with no root returns an absolute, un-relativized location", () => {
  const here = new URL(".", import.meta.url).href;
  const wrapperRoot = new URL("./fixtures/", import.meta.url).href;
  const site = resolveFromWrapper();

  expect(site.startsWith("/")).toBe(true);
  expect(site).not.toStartWith(normalizeLocation(wrapperRoot));
  expect(site.startsWith(normalizeLocation(here))).toBe(true);
});
