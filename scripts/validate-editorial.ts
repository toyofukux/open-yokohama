import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderChildcareCharts } from '../packages/core/childcare-charts';
import { allPolicyIssues } from '../packages/core/policy-issues';
import { assertPublishable } from '../packages/core/review';

// Direct Astro builds must also reject chart/data drift.
const childcareCharts = renderChildcareCharts(
  JSON.parse(readFileSync('data/childcare/charts.json', 'utf8')),
);
for (const [id, html] of Object.entries(childcareCharts)) {
  assert.equal(
    readFileSync(`data/editorial/figures/${id}.html`, 'utf8'),
    html,
    `Stale chart: ${id}`,
  );
}

const records = JSON.parse(readFileSync('docs/content-review/publication.json', 'utf8'));
const expected = new Set([...allPolicyIssues.map((issue) => issue.url), '/elections/mayor-2026/']);
assert.deepEqual(new Set(records.articles.map((r: { route: string }) => r.route)), expected);
assert.equal(records.articles.length, expected.size, 'Duplicate editorial publication record');
for (const record of records.articles) {
  const digest = createHash('sha256');
  for (const path of record.contentFiles) {
    digest.update(path).update('\0').update(readFileSync(path)).update('\0');
  }
  const actual = digest.digest('hex');
  for (const source of record.sources) {
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(source.url.startsWith('https://'));
  }
  assertPublishable(
    record.article,
    record.review,
    new Set<string>(record.sources.map((s: { id: string }) => s.id)),
    actual,
  );
  assert.ok(record.authorization.instruction && record.authorization.scope);
  assert.equal(record.authorization.kind, 'user_publication_instruction');
  if (record.manuscriptPath) {
    const body = readFileSync(record.manuscriptPath, 'utf8')
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .trim();
    const sections = body.split(/\n(?=## )/).map((section) => section.trim());
    assert.deepEqual(
      record.article.claims.map((claim: { text: string }) => claim.text),
      sections,
      'Every manuscript section must be covered by the content review',
    );
    for (const url of body.matchAll(/\]\((https:\/\/[^)]+)\)/g)) {
      assert.ok(
        record.sources.some((source: { url: string }) => source.url === url[1].split('#')[0]),
        'Manuscript citation absent from source inventory',
      );
    }
  }
}
console.log(
  `Editorial publication contract verified for ${records.articles.length} article(s). Author checks are not independent review.`,
);
