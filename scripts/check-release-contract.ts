import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { allPolicyIssues } from '../packages/core/policy-issues.ts';
import { geographies } from '../packages/core/schema.ts';
import { articles, currentFacts, releaseId } from '../packages/warehouse/current.ts';

const root = 'apps/web/dist';
const routes = [
  '/',
  '/issues/',
  '/elections/mayor-2026/',
  ...allPolicyIssues.map((i) => i.url),
  '/population-history/',
  '/population-movement/',
  '/age-structure/',
  '/datasets/',
  '/wards/',
  ...geographies
    .filter((g) => g.slug !== 'yokohama')
    .flatMap((g) => [`/population-history/${g.slug}/`, `/wards/${g.slug}/`]),
  ...geographies.map((g) => `/population-movement/${g.slug}/`),
];
for (const route of routes)
  assert.ok(existsSync(`${root}${route}index.html`), `Published route missing: ${route}`);
for (const extension of ['svg', 'png', 'csv'])
  assert.ok(existsSync(`${root}/maps/childcare-2026.${extension}`));
const redirects = readFileSync(`${root}/_redirects`, 'utf8');
const sitemap = readFileSync(`${root}/sitemap.xml`, 'utf8');
for (const slug of ['population', 'households', 'density']) {
  assert.ok(
    !existsSync(`${root}/issues/${slug}/index.html`),
    `Retired article republished: ${slug}`,
  );
  for (const suffix of ['', '/'])
    assert.ok(
      redirects.split('\n').includes(`/issues/${slug}${suffix} /wards/?metric=${slug} 301`),
    );
  assert.ok(!sitemap.includes(`/issues/${slug}/`));
}
for (const route of routes)
  assert.ok(sitemap.includes(`https://open.yokohama${route}<`), `Sitemap route missing: ${route}`);
assert.equal(articles.length, 19);
assert.ok(currentFacts().length >= 44638, 'Published warehouse observations disappeared');
const mcp = JSON.parse(readFileSync('apps/mcp/wrangler.jsonc', 'utf8'));
assert.equal(mcp.workers_dev, false);
assert.equal(mcp.preview_urls, false);
assert.deepEqual(mcp.routes, []);
const manifest = {
  schemaVersion: 1,
  warehouseReleaseId: releaseId,
  routes,
  policyArticles: allPolicyIssues.map((i) => i.url),
  warehouseArticles: articles.length,
  observations: currentFacts().length,
  mcpPublic: false,
};
writeFileSync(`${root}/release-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Release contract: ${allPolicyIssues.length} policy articles, ${articles.length} warehouse articles, ${currentFacts().length} values; retired routes and MCP privacy checked.`,
);
