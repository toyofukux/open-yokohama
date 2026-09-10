import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { renderChildcareCharts } from '../packages/core/childcare-charts';

const data = JSON.parse(readFileSync('data/childcare/charts.json', 'utf8'));
const inventory = JSON.parse(
  readFileSync('docs/content-review/mayoral-issues/sources.json', 'utf8'),
);
for (const chart of [data.history, data.ages]) {
  const source = inventory.find((item: { id: string }) => item.id === chart.sourceId);
  assert.equal(source.sha256, chart.sourceSha256);
  assert.equal(source.url, chart.sourceUrl.split('#')[0]);
}
for (const [id, html] of Object.entries(renderChildcareCharts(data))) {
  const path = `data/editorial/figures/${id}.html`;
  if (process.argv.includes('--check'))
    assert.equal(readFileSync(path, 'utf8'), html, `Stale chart: ${path}`);
  else writeFileSync(path, html);
}
console.log('Childcare charts: 2 figures, source versions, populations and arithmetic verified.');
