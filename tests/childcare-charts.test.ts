import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderChildcareCharts } from '../packages/core/childcare-charts';

const data = () => JSON.parse(readFileSync('data/childcare/charts.json', 'utf8'));
test('childcare charts retain raw counts, common scales and the distinct age population', () => {
  const charts = renderChildcareCharts(data());
  const history = charts['childcare-history'];
  const ages = charts['childcare-ages'];
  const values = [...history.matchAll(/data-value="(\d+)" style="height:([\d.]+)%"/g)];
  assert.deepEqual(
    values.map((m) => Number(m[1])),
    [201626, 28112, 191770, 45707],
  );
  for (const match of values)
    assert.ok(Math.abs(Number(match[2]) * 2500 - Number(match[1])) < 0.01);
  assert.match(history, /4\.9％減、<\/span><span>申込みは62\.6％増/);
  assert.match(ages, /育児休業の延長希望を除く1,256人/);
  assert.match(ages, /1・2歳児は904人で約72％/);
  assert.match(ages, /年齢ごとの入園の難しさを示す率ではない/);
});
test('childcare charts reject denominator mixing, missing ages and values outside the axis', () => {
  for (const mutate of [
    (x: ReturnType<typeof data>) => {
      x.ages.total = 2532;
    },
    (x: ReturnType<typeof data>) => {
      x.ages.excludingExtensionDesired = false;
    },
    (x: ReturnType<typeof data>) => {
      x.ages.values.pop();
    },
    (x: ReturnType<typeof data>) => {
      x.ages.values[1] = null;
    },
    (x: ReturnType<typeof data>) => {
      x.history.children[0] = 300000;
    },
    (x: ReturnType<typeof data>) => {
      x.history.years[1] = 2026;
    },
  ]) {
    const changed = data();
    mutate(changed);
    assert.throws(() => renderChildcareCharts(changed));
  }
});
