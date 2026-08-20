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
 * compare equal, or `isOwnFrame`/`relativize` silently stop matching. A bare
 * path is trusted as-is and never decoded, since it may contain a literal
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

function isOwnFrame(location: string): boolean {
  return location.startsWith(OWN_ROOT);
}

/**
 * Walk a captured V8-style stack and return the first frame that isn't this
 * library's own code — the actual external call site, regardless of how many
 * internal frames (a registry getter, a primitive's builder, this module
 * itself) sit above it. Falls back to the last frame, then the raw stack, if
 * every frame looks internal or none are found. Every candidate location is
 * normalized before the own-frame comparison and before being returned, so a
 * Node ESM `file://` frame and a Bun bare-path frame for the same file compare
 * equal and yield the same string either way.
 */
function firstExternalFrame(stack: string): string {
  const locations = stack
    .split("\n")
    .filter((line) => line.trim().startsWith("at "))
    .map(extractLocation)
    .map(normalizeLocation);

  return (
    locations.find((location) => !isOwnFrame(location))
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
 */
export function resolveCallerFile(): string {
  if (typeof Error.captureStackTrace === "function") {
    const captured: { stack?: string } = {};
    Error.captureStackTrace(captured);
    return stripPosition(firstExternalFrame(captured.stack ?? ""));
  }

  return stripPosition(new Error().stack ?? "");
}
