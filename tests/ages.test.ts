import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import raw from '../data/published/ages.json';
import stock from '../data/published/population.json';
import { queryAges, validateAges } from '../packages/core/ages.ts';
import { parseAges } from '../packages/ingestion/ages.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';

const data = validateAges(raw);
const source = data.snapshots[0];
const csv = decodeCsv(readFileSync(source.path));
test('age groups include 100-plus and retain unknown without redistribution', () => {
  const city = data.records.find((r) => r.period === '2025-01-01' && r.geography === '141003');
  assert.ok(city);
  assert.deepEqual(city.values, {
    age_total: 3769584,
    age_under15: 409362,
    age_15to64: 2326538,
    age_65plus: 934895,
    age_unknown: 98789,
  });
  assert.equal(city.sourceRows.age_65plus.length, 36);
  assert.equal(city.sourceRows.age_under15.length, 15);
  assert.equal(city.sourceRows.age_15to64.length, 50);
  assert.deepEqual(parseAges(csv, source.id), data.records);
});
test('age totals match population stock at shared January dates', () => {
  const index = new Map(
    stock.observations
      .filter((o) => o.metric === 'population')
      .map((o) => [`${o.period}:${o.geography}`, o.value]),
  );
  let matched = 0;
  for (const r of data.records) {
    const expected = index.get(`${r.period}:${r.geography}`);
    if (expected !== undefined) {
      assert.equal(r.values.age_total, expected);
      matched++;
    }
  }
  assert.ok(matched >= 38);
});
test('source queries expose all contributing rows and missing periods', () => {
  const result = queryAges(data, {
    geography: '141003',
    metric: 'age_under15',
    period: '2025-01-01',
  });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].rows.length, 15);
  assert.equal(queryAges(data, { period: '2025-03-31' }).unavailable, true);
});
test('age parser rejects missing cells, unknown ages and duplicate source records', () => {
  assert.throws(() => parseAges(csv.replace(',3769584\r\n', ',\r\n'), source.id), /number/);
  assert.throws(() => parseAges(csv.replace('100歳以上', '101歳以上'), source.id), /dimension/);
  const lines = csv.trimEnd().split(/\r?\n/);
  assert.throws(() => parseAges([...lines, lines[1]].join('\r\n'), source.id), /Duplicate/);
  assert.throws(
    () => parseAges(lines.filter((_, i) => i !== 1).join('\r\n'), source.id),
    /Incomplete/,
  );
});
test('age schema rejects incomplete years, duplicate wards, wrong sums and source rows', () => {
  const missing = structuredClone(raw);
  missing.records = missing.records.filter((r) => r.period !== '2005-01-01');
  assert.throws(() => validateAges(missing), /Incomplete/);
  const duplicate = structuredClone(raw);
  duplicate.records.push(duplicate.records[0]);
  assert.throws(() => validateAges(duplicate), /Duplicate/);
  const sum = structuredClone(raw);
  sum.records[0].values.age_unknown++;
  assert.throws(() => validateAges(sum), /total/);
  const rows = structuredClone(raw);
  rows.records[0].sourceRows.age_unknown = [rows.records[0].sourceRows.age_total[0]];
  assert.throws(() => validateAges(rows), /rows/);
  const future = structuredClone(raw);
  future.generatedAt = '2001-01-01T00:00:00.000Z';
  assert.throws(() => validateAges(future), /future/);
});
