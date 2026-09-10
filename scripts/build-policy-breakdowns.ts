import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { renderPolicyBreakdowns } from '../packages/core/policy-breakdowns';

const data = JSON.parse(readFileSync('data/editorial/breakdowns.json', 'utf8'));
const inventory = JSON.parse(readFileSync('docs/content-review/expansion/sources.json', 'utf8'));
for (const d of Object.values(data) as {
  sourceId: string;
  sourceSha256: string;
  sourceUrl: string;
}[]) {
  const source = inventory.find((s: { id: string }) => s.id === d.sourceId);
  assert.equal(d.sourceSha256, source?.sha256);
  assert.equal(d.sourceUrl.split('#')[0], source?.url);
}
for (const [id, html] of Object.entries(renderPolicyBreakdowns(data))) {
  const path = `data/editorial/figures/${id}.html`;
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), html, path);
  else writeFileSync(path, html);
}
console.log('Policy breakdown figures match their source-pinned data.');
