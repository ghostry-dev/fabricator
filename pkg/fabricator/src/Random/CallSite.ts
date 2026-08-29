/**
 * This package's own source root (one level up from this file's directory),
 * resolved from `import.meta.url` so it tracks wherever the code is actually
 * running from — `src/` in this repo's own tests, `dist/` when consumed as a
 * built package. `.href`, not `.pathname`: normalization needs to see the
 * `file://` scheme to know a value requires decoding, and `.pathname` alone
 * would strip it before that decision could be made. Used to recognize and skip
 * this library's own frames when walking a captured stack, regardless of how
 * many internal layers sit between a public call and the point of capture.
 */
const OWN_ROOT = normalizeLocation(new URL("..", import.meta.url).href);

/**
 * Line:col is reliably the trailing `:digits:digits` on a stack frame line
 * across V8, JavaScriptCore, and SpiderMonkey formats. Stripping it keeps a
 * file-derived seed stable across unrelated edits elsewhere in a file (blank
 * lines, comments, reformatting) that would otherwise shift every line number
 * below them.
 */
function stripPosition(text: string): string {
  return text.replace(/:\d+:\d+/g, "");
}

/** Reduce a single V8-style frame line to just its location. */
function extractLocation(frameLine: string): string {
  const trimmed = frameLine.trim().replace(/^at\s+/, "");
  const parenthesized = trimmed.match(/\(([^()]*)\)$/);
  return parenthesized ? parenthesized[1]! : trimmed;
}

/**
 * Percent-decode, falling back to the input when it can't be. Only applied to
 * the `file://` branch of {@link normalizeLocation}, whose URLs are
 * runtime-emitted and well-formed — a literal `%` in a directory name arrives
 * as `%25`, so the `URIError` a stray `%` would raise cannot occur there. The
 * catch is a total fallback, not a case being handled: a bare path, which may
 * contain a literal `%`, never reaches here.
 */
function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * One canonical form for a location, whatever produced it: Node ESM emits
 * `file:///…` URLs, Bun emits bare absolute paths, and this module's own
 * `import.meta.url` is percent-encoded — three spellings of one file that must
 * compare equal, or `isInternalFrame`/`relativize` silently stop matching. A
 * bare path is trusted as-is and never decoded, since it may contain a literal
 * `%20`; only the `file://` form's escaping is guaranteed well-formed. Forward
 * slashes and an uppercased leading `/X:/` drive fold Windows' `C:\a\b` and
 * `file:///c:/a/b` together — the drive is the one component two sources
 * disagree on, so it's the only thing case-folded: doing more would break
 * case-sensitive filesystems and change what ends up hashed.
 */
export function normalizeLocation(location: string): string {
  const isUrl = location.startsWith("file://");
  const path = isUrl ? decode(location.slice("file://".length)) : location;

  return path
    .replace(/\\/g, "/")
    .replace(
      /^\/?([A-Za-z]):\//,
      (_, letter: string) => `/${letter.toUpperCase()}:/`,
    );
}

/**
 * The directory a location sits in, trailing separator included — without it, a
 * root of `/a/b/` would match the unrelated sibling `/a/bcd/x.ts`, since
 * `startsWith`/prefix-stripping only sees character runs, not path segments.
 */
export function directoryOf(location: string): string {
  const cut = location.lastIndexOf("/");
  return cut === -1 ? location : location.slice(0, cut + 1);
}

/**
 * `file` expressed relative to `root`, ascending with `..` where `file` sits
 * outside `root` rather than falling back to `file` unchanged. An ascending
 * path stays identical across machines whose checkouts hold both locations at
 * the same relative position, the common case for anything under the same
 * repository — passing an escaping file through as absolute would defeat the
 * default `"call site"` policy for every schema helper that isn't a sibling of
 * wherever `initialize()` was called. A location that isn't an absolute path
 * (`native`, `<anonymous>`, or a value that has already been relativized)
 * doesn't start with `/` and is returned unchanged — applying this twice is a
 * no-op, which lets `T.recursive` thread an already-relativized file back
 * through here uniformly.
 */
export function relativize(root: string, file: string): string {
  if (!file.startsWith("/")) return file;

  const from = root.split("/").filter(Boolean);
  const to = file.split("/").filter(Boolean);

  let shared = 0;
  while (
    shared < from.length
    && shared < to.length
    && from[shared] === to[shared]
  ) {
    shared++;
  }

  const traversals = Array(from.length - shared).fill("..");

  return [...traversals, ...to.slice(shared)].join("/");
}

function isInternalFrame(
  location: string,
  otherInternals: readonly string[] = [],
): boolean {
  if (location.startsWith(OWN_ROOT)) return true;
  return otherInternals.some((skip) => location.startsWith(skip));
}

/**
 * Walk a captured V8-style stack and return the first frame that isn't this
 * library's own code — the actual external call site, regardless of how many
 * internal frames (a registry getter, a primitive's builder, this module
 * itself) sit above it. `otherInternals`, when given, excludes those roots _in
 * addition to_ `OWN_ROOT`. Falls back to the last frame, then the raw stack, if
 * every frame looks internal or none are found. Every candidate location is
 * normalized before the own-frame comparison and before being returned, so a
 * Node ESM `file://` frame and a Bun bare-path frame for the same file compare
 * equal and yield the same string either way.
 */
function firstExternalFrame(
  stack: string,
  otherInternals: readonly string[] = [],
): string {
  const locations = stack
    .split("\n")
    .filter((line) => line.trim().startsWith("at "))
    .map(extractLocation)
    .map(normalizeLocation);

  return (
    locations.find((location) => !isInternalFrame(location, otherInternals))
    ?? locations[locations.length - 1]
    ?? stack
  );
}

/**
 * Resolve the file that (transitively) triggered the current call, so
 * construction can be attributed to the source file the user wrote it in.
 *
 * Primary path: `Error.captureStackTrace` (V8, and Bun for Node compatibility)
 * captures the full stack, then `firstExternalFrame` skips this library's own
 * frames by path — no need to hardcode how many frames to exclude, so it stays
 * correct as internal call depth changes.
 *
 * Fallback: engines without `captureStackTrace` get the whole raw stack,
 * position-stripped, hashed as-is rather than guessing which frame to isolate.
 * Lower fidelity (sensitive to edits anywhere in the visible call chain, not
 * just the immediate caller), but rarely exercised — Bun, Node, and Chrome all
 * support the primary path. Left unnormalized: a whole multi-line stack has no
 * single location for `normalizeLocation`'s separator/drive rewriting to apply
 * to, so this path never relativizes — it always falls through `relativize`'s
 * non-absolute passthrough instead.
 *
 * Both options exist for a library that wraps fabricator and wants to attribute
 * a construction to _its own_ caller rather than to itself —
 * `@ghostry/extern`'s testing scope is the motivating case: it opens a `wrap`
 * per test and wants the resolved site to be the test file, not `extern`'s own
 * module. This module's own callers (`resolveAttribution`'s `"call site"`
 * branch, `resolveRootFile`) pass neither.
 *
 * `skip`, when given, is a list of _additional_ roots to exclude — layered onto
 * `OWN_ROOT`, never replacing it. With a wrapper between fabricator and the
 * real caller, the stack reads fabricator → wrapper → caller: omitting
 * `OWN_ROOT` from the skip set would make this resolve to fabricator's own file
 * instead of stopping at the wrapper.
 *
 * Always a list, never a bare root: a _chain_ of wrappers needs every link
 * named, and any link left out is where resolution stops. An integration
 * layered on another integration reads fabricator → inner → outer → caller —
 * `@ghostry/extern`'s fabricator extension sits between fabricator and extern
 * exactly this way.
 *
 * `root`, when given, relativizes the result exactly as a `{ kind: "rooted" }`
 * attribution policy does ({@link relativize}) — so a caller needs no separate
 * import to get a checkout-relative path.
 */
export function resolveCallerFile(options?: {
  readonly skip?: readonly string[];
  readonly root?: string;
}): string {
  const skip = options?.skip?.map(normalizeLocation);
  const stack = captureRawStack();

  const location = stripPosition(
    stack.walkable ? firstExternalFrame(stack.text, skip) : stack.text,
  );

  return options?.root === undefined
    ? location
    : relativize(normalizeLocation(options.root), location);
}

/**
 * A captured stack, paired with whether it can be walked frame by frame.
 *
 * The two capture strategies do not produce interchangeable text, so which one
 * ran has to travel with the result: `Error.captureStackTrace` yields a stack
 * scoped to the capturing call, whose frames {@link firstExternalFrame} walks to
 * isolate the external call site, while the `new Error().stack` fallback is
 * consumed whole. Carrying the distinction is what lets the capability check
 * happen exactly once per call — inferring it a second time at the point of
 * use, as a separate `typeof` test, both duplicates the check and lets the two
 * sites disagree.
 */
type CapturedStack = { readonly text: string; readonly walkable: boolean };

/**
 * `Error.captureStackTrace` when available (V8, and Bun for Node compatibility)
 * captures a stack scoped to this call, excluding this function's own frame;
 * `new Error().stack` is the universal fallback. This function's own frame need
 * not be excluded from the walkable branch either way — it sits under
 * `OWN_ROOT`, so {@link isInternalFrame} skips it like any other internal
 * frame.
 */
function captureRawStack(): CapturedStack {
  if (typeof Error.captureStackTrace !== "function") {
    return { text: new Error().stack ?? "", walkable: false };
  }

  const captured: { stack?: string } = {};
  Error.captureStackTrace(captured);

  return { text: captured.stack ?? "", walkable: true };
}
