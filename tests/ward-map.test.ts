import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import base from '../data/geography/yokohama-wards.json';
import { classifyRelative, parseChildcareWardTable } from '../packages/core/childcare';
import { campaignActive, featuredIndex } from '../packages/core/presentation';
import { renderWardMap } from '../packages/core/ward-map';

const raw = readFileSync('data/childcare/ward-table-2026.txt', 'utf8');
test('18 ward denominators reconcile with the city and distinguish volume from rate', () => {
  const data = parseChildcareWardTable(raw);
  assert.equal(data.wards.length, 18);
  assert.equal(data.city.applicants, 73834);
  assert.equal(data.city.held, 2532);
  assert.equal(data.city.waiting, 0);
  assert.equal(
    data.wards.reduce((sum, ward) => sum + ward.applicants, 0),
    73834,
  );
  assert.equal([...data.wards].sort((a, b) => b.held - a.held)[0].name, '港北区');
  assert.equal([...data.wards].sort((a, b) => b.rate - a.rate)[0].name, '瀬谷区');
  assert.deepEqual(
    data.wards
      .filter((w) => w.band === 'high')
      .map((w) => w.name)
      .sort(),
    ['旭区', '栄区', '泉区', '瀬谷区'].sort(),
  );
  assert.equal(data.wards.filter((w) => w.band === 'low').length, 4);
  assert.equal(data.city.rate.toFixed(1), '3.4');
  assert.notEqual(data.city.rate, data.wards.reduce((sum, w) => sum + w.rate, 0) / 18);
});
test('missing, duplicate and corrupted source rows fail closed', () => {
  const row = raw.split('\n').find((line) => line.trim().startsWith('鶴見 '));
  assert.ok(row);
  assert.throws(() => parseChildcareWardTable(raw.replace(row, '')));
  assert.throws(() => parseChildcareWardTable(`${raw}\n${row}`));
  assert.throws(() => parseChildcareWardTable(raw.replace('6,599', '6,598')));
  assert.throws(() => parseChildcareWardTable(raw.replace(row, `${row} 1`)));
});
test('comparison uses unrounded boundaries and keeps missing distinct from zero', () => {
  assert.equal(classifyRelative(7.999, 10), 'low');
  assert.equal(classifyRelative(8, 10), 'middle');
  assert.equal(classifyRelative(11.999, 10), 'middle');
  assert.equal(classifyRelative(12, 10), 'high');
  assert.equal(classifyRelative(0, 10), 'low');
  assert.equal(classifyRelative(null, 10), 'missing');
  for (const value of [-1, NaN, Infinity]) assert.throws(() => classifyRelative(value, 10));
  for (const reference of [0, -1, NaN]) assert.throws(() => classifyRelative(1, reference));
});
test('the reusable SVG is deterministic, escapes text, rejects unknown or duplicate wards', () => {
  const values = [{ code: base.wards[0].code, label: '<test>', band: 'low' as const }];
  const svg = renderWardMap(base, values, 'test', 'description');
  assert.equal(svg, renderWardMap(base, values, 'test', 'description'));
  assert.equal((svg.match(/data-ward=/g) ?? []).length, 18);
  assert.equal((svg.match(/data-band="missing"/g) ?? []).length, 17);
  assert.ok(svg.includes('&lt;test&gt;'));
  assert.throws(() => renderWardMap(base, [...values, ...values], 'test', ''));
  assert.throws(() => renderWardMap(base, [{ ...values[0], code: '000000' }], 'test', ''));
});
test('rotation changes at midnight JST, covers seven questions and campaign expires', () => {
  const before = new Date('2026-09-07T14:59:59Z');
  const after = new Date('2026-09-07T15:00:00Z');
  assert.equal(featuredIndex(after, 7), (featuredIndex(before, 7) + 1) % 7);
  assert.equal(
    new Set(
      Array.from({ length: 7 }, (_, i) =>
        featuredIndex(new Date(after.getTime() + i * 86400000), 7),
      ),
    ).size,
    7,
  );
  assert.throws(() => featuredIndex(after, 0));
  assert.equal(campaignActive(new Date('2026-09-06T14:59:59Z')), false);
  assert.equal(campaignActive(new Date('2026-09-06T15:00:00Z')), true);
  assert.equal(campaignActive(new Date('2026-10-18T14:59:59Z')), true);
  assert.equal(campaignActive(new Date('2026-10-18T15:00:00Z')), false);
});
