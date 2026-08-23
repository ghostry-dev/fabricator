import { defineConfig } from "vocs/config";

/**
 * The single source of truth for where this site lives — moving the site is a
 * change to this line and nothing else.
 *
 * The `docs.ghostry.dev` domain belongs to the `ghostry-dev.github.io` org-site
 * repo, not to this one. Project sites inherit their account's custom domain
 * and keep their repo name as the path, which is what puts this site at
 * `/fabricator` and leaves the other subpaths free for sibling libraries.
 *
 * That inheritance is also why this repo must ship no `public/CNAME`: a CNAME
 * file in the uploaded artifact claims the domain _root_ for this repo alone,
 * which would both move these docs to `/` and lock every other library out.
 */
const DEPLOYMENT = new URL("https://docs.ghostry.dev/fabricator/");
const BASE_PATH = DEPLOYMENT.pathname.replace(/\/$/, "");

/** Alphabetical `T.*` names — one page each under Schema Primitives → All. */
const PRIMITIVES = [
  "always",
  "array",
  "bigint",
  "boolean",
  "choice",
  "date",
  "enum",
  "null",
  "nullable",
  "nullish",
  "number",
  "object",
  "omittable",
  "opaque",
  "optional",
  "record",
  "recursive",
  "string",
  "symbol",
  "tuple",
  "undefinable",
  "undefined",
] as const;

export default defineConfig({
  title: "fabricator",
  description: "Fabricate typed data from composable schemas.",
  /**
   * Vocs does not prefix `logoUrl`/`iconUrl` with `basePath`, so these have to
   * include it or GitHub Pages resolves them at the domain root.
   */
  logoUrl: `${BASE_PATH}/logo.png`,
  iconUrl: `${BASE_PATH}/icon.png`,
  /**
   * Electric blue on light surfaces, lavender on dark — the two most readable
   * faces of the mark. Surfaces and the gray ramp live in `src/pages/_root.css`
   * so they stay aligned with the same palette.
   */
  accentColor: "light-dark(#4c51ff, #9378ff)",
  renderStrategy: "full-static",
  /**
   * `baseUrl` is the origin, not the deployment URL — `Head.tsx` appends
   * `basePath` + the page path itself to build the canonical URL and `og:url`.
   * It also emits a `<base href>` tag by default, which is suppressed below via
   * `head: { base: false }` since it would otherwise change relative-URL
   * resolution site-wide.
   */
  baseUrl: DEPLOYMENT.origin,
  head: { base: false },
  /**
   * Vocs does not prefix `ogImageUrl` with `basePath` either (same as
   * `logoUrl`/`iconUrl`), and it must be absolute for link-preview scrapers
   * that don't resolve relative URLs — hence building off `DEPLOYMENT` directly
   * rather than `BASE_PATH`.
   */
  ogImageUrl: new URL("og.png", DEPLOYMENT).href,
  /**
   * `href` is internal-link resolved by Vocs itself, which already prefixes it
   * with `basePath` — unlike `logoUrl`/`iconUrl`/`ogImageUrl` above, do not
   * prepend `BASE_PATH` here, or the link doubles it
   * (`/fabricator/fabricator/...`).
   */
  banner: {
    content: "fabricator is v0 and will make breaking changes.",
    variant: "warning",
    dismissable: false,
  },
  topNav: [
    { text: "Start", link: "/start/quick-start", match: "/start" },
    { text: "Guides", link: "/guides/reproducibility", match: "/guides" },
    { text: "Primitives", link: "/reference/primitives" },
    { text: "API", link: "/reference/api" },
  ],
  /**
   * Vocs 2.8.5 hard-codes the domain root in two unrelated places that should
   * respect `basePath`, both fixed in `patches/vocs@2.8.5.patch`:
   *
   * - The markdown twins behind "Ask AI" — the client links to `/assets/md/*.md`
   *   and `vocs dev` only answers there, while the build writes them under
   *   `basePath`.
   * - `sitemap.xml` and `robots.txt` — their URLs come from `baseUrl` alone, even
   *   though `Head.tsx` does apply `basePath` to the canonical of the very same
   *   page. On a shared domain that is worse than cosmetic: the sitemap would
   *   claim `/start/why` rather than `/fabricator/start/why`, colliding with
   *   the sibling libraries hosted under the other subpaths.
   *
   * Upstream PR #627 covers the "Ask AI" half; check whether it also reaches
   * the sitemap before dropping any of these hunks.
   *
   * @see https://github.com/wevm/vocs/pull/627
   */
  basePath: BASE_PATH,
  codeHighlight: { themes: { light: "catppuccin-latte", dark: "github-dark" } },
  socials: [
    { icon: "github", link: "https://github.com/ghostry-dev/fabricator" },
  ],
  sidebar: [
    {
      text: "Start here",
      items: [
        { text: "Why Fabricator?", link: "/start/why" },
        { text: "Installation", link: "/start/installation" },
        { text: "Quick start", link: "/start/quick-start" },
        { text: "Mental model", link: "/start/mental-model" },
      ],
    },
    {
      text: "Guides",
      items: [
        { text: "Reproducibility", link: "/guides/reproducibility" },
        { text: "Objects", link: "/guides/objects" },
        { text: "Composition", link: "/guides/composition" },
        { text: "Distributions", link: "/guides/distributions" },
        { text: "TypeBox", link: "/guides/typebox" },
        { text: "Faker", link: "/guides/faker" },
        { text: "Custom types", link: "/guides/custom-types" },
      ],
    },
    {
      text: "Schema Primitives",
      items: [
        { text: "Overview", link: "/reference/primitives" },
        {
          text: "All",
          collapsed: true,
          items: PRIMITIVES.map((name) => ({
            text: `T.${name}`,
            link: `/reference/primitives/${name}`,
          })),
        },
      ],
    },
    {
      text: "Reference",
      items: [{ text: "Public API", link: "/reference/api" }],
    },
    {
      text: "About",
      items: [{ text: "Limitations", link: "/about/limitations" }],
    },
  ],
});
