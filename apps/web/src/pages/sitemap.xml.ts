import type { APIContext } from "astro";
import { geographies } from "../../../../packages/core/schema";
import { issues } from "../../../../packages/core/issues";
export function GET({ site }: APIContext) {
  const paths = [
    "/",
    "/issues/",
    "/population-movement/",
    "/age-structure/",
    "/population-history/",
    "/datasets/",
    ...geographies
      .filter((g) => g.slug !== "yokohama")
      .map((g) => `/population-history/${g.slug}/`),
    ...geographies.map((g) => `/population-movement/${g.slug}/`),
    "/wards/",
    "/sources/",
    "/about/",
    "/search/",
    "/developers/",
    ...geographies
      .filter((g) => g.slug !== "yokohama")
      .map((g) => `/wards/${g.slug}/`),
    ...issues.map((i) => `/issues/${i.slug}/`),
  ];
  const base = site ?? new URL("https://open.yokohama");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${new URL(path, base).href}</loc></url>`).join("")}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
