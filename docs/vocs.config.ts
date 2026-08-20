import { defineConfig } from "vocs/config";

/**
 * The single source of truth for where this site lives. Moving to a custom
 * domain (e.g. https://docs.ghostry.dev/) is a change to this line and
 * nothing else. A custom domain additionally needs a CNAME file emitted into
 * the build output.
 */
const DEPLOYMENT = new URL("https://ghostry-dev.github.io/fabricator/");
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
   * Vocs does not prefix `logoUrl`/`iconUrl` with `basePath`, so these have
   * to include it or GitHub Pages resolves them at the domain root.
   */
  logoUrl: `${BASE_PATH}/logo.png`,
  iconUrl: `${BASE_PATH}/logo.png`,
  /**
   * Electric blue on light surfaces, lavender on dark — the two most
   * readable faces of the mark. Surfaces and the gray ramp live in
   * `src/pages/_root.css` so they stay aligned with the same palette.
   */
  accentColor: "light-dark(#4c51ff, #9378ff)",
  renderStrategy: "full-static",
  basePath: BASE_PATH,
  codeHighlight: { themes: { light: "catppuccin-latte", dark: "tokyo-night" } },
  socials: [
    { icon: "github", link: "https://github.com/ghostry-dev/fabricator" },
  ],
  /**
   * Old grouping URLs. Middleware-only — GitHub Pages will not honor these;
   * they exist so `vocs dev` / `vocs preview` don't 404 bookmarked paths.
   */
  redirects: [
    {
      source: "/reference/primitives/scalars",
      destination: "/reference/primitives#scalars",
    },
    {
      source: "/reference/primitives/literals-and-choices",
      destination: "/reference/primitives#literals-and-choices",
    },
    {
      source: "/reference/primitives/absence",
      destination: "/reference/primitives#absence",
    },
    {
      source: "/reference/primitives/collections",
      destination: "/reference/primitives#collections",
    },
    {
      source: "/reference/primitives/structures",
      destination: "/reference/primitives#structures",
    },
    {
      source: "/reference/primitives/escape-hatch",
      destination: "/reference/primitives#escape-hatch",
    },
  ],
  sidebar: [
    {
      text: "Start here",
      items: [
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
