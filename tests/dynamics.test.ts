import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import raw from '../data/published/dynamics.json';
import population from '../data/published/population.json';
import { dynamicsKey, queryDynamics, validateDynamics } from '../packages/core/dynamics.ts';
import { parseDynamics } from '../packages/ingestion/dynamics.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';

const data = validateDynamics(raw);
const source = data.snapshots.find((s) => s.scope === 'year');
assert.ok(source);
const csv = decodeCsv(readFileSync(source.path));
test('official dynamics retain other changes and internal movement imbalances', () => {
  const result = queryDynamics(data, { geography: '141003', frequency: 'year', period: '2025' });
  const get = (metric: string) => result.observations.find((o) => o.metric === metric)?.value;
  assert.equal(get('total_change'), 164);
  assert.equal(get('births'), 21831);
  assert.equal(get('deaths'), 40563);
  assert.equal(get('social_change'), 18896);
  assert.equal(get('other_change'), 267);
  assert.notEqual(get('internal_in'), get('internal_out'));
  assert.equal(get('social_change'), 152685 - 134070 + 66082 - 66068 + 267);
});
test('monthly flows reconcile with next-month reported population changes, including rebasing', () => {
  for (const observation of data.observations.filter(
    (o) => o.frequency === 'month' && o.metric === 'total_change',
  )) {
    const next = new Date(
      Date.UTC(Number(observation.period.slice(0, 4)), Number(observation.period.slice(5)), 1),
    )
      .toISOString()
      .slice(0, 10);
    const stock = population.observations.find(
      (o) => o.geography === '141003' && o.metric === 'population_change' && o.period === next,
    );
    if (stock) assert.equal(observation.value, stock.value, observation.period);
  }
});
test('ward monthly data and absent years return unavailable, not invented zeros', () => {
  assert.equal(queryDynamics(data, { geography: '141097', frequency: 'month' }).unavailable, true);
  assert.equal(queryDynamics(data, { frequency: 'year', period: '1999' }).unavailable, true);
  assert.equal(
    queryDynamics(data, { frequency: 'year', period: '2025', metric: 'births' }).observations
      .length,
    19,
  );
});
test('original CSV rows and total, male, female validation are preserved', () => {
  assert.deepEqual(
    parseDynamics(csv, 'year', source.id),
    data.observations.filter((o) => o.sourceId === source.id),
  );
  assert.throws(() => parseDynamics(csv.replace('数・率', '値'), 'year', source.id), /schema/);
  assert.throws(
    () => parseDynamics(csv.replace(/,21831(\r?\n)/, ',$1'), 'year', source.id),
    /number/,
  );
  assert.throws(
    () => parseDynamics(csv.replace(/,21831(\r?\n)/, ',21832$1'), 'year', source.id),
    /sex total/,
  );
  assert.throws(() => parseDynamics(csv.replace(',出生,', ',新出生,'), 'year', source.id), /kind/);
  assert.throws(() => parseDynamics(`${csv}\n${csv.split(/\r?\n/)[1]}`, 'year', source.id));
});
test('missing metrics, whole wards, months and years fail closed', () => {
  for (const remove of [
    (o: (typeof raw.observations)[number]) => o.period === '2025' && o.geography === '141097',
    (o: (typeof raw.observations)[number]) => o.period === '2024-05',
    (o: (typeof raw.observations)[number]) => o.period === '2005',
    (o: (typeof raw.observations)[number]) => o.metric === 'births' && o.period === '2025',
  ]) {
    const broken = structuredClone(raw);
    broken.observations = broken.observations.filter((o) => !remove(o));
    assert.throws(() => validateDynamics(broken), /Incomplete|Missing/);
  }
});
test('duplicate, changed arithmetic, wrong source and future periods are rejected', () => {
  const duplicate = structuredClone(raw);
  duplicate.observations.push(duplicate.observations[0]);
  assert.throws(() => validateDynamics(duplicate), /Duplicate/);
  const changed = structuredClone(raw);
  changed.observations[0].value++;
  assert.throws(() => validateDynamics(changed), /arithmetic/);
  const sourceMismatch = structuredClone(raw);
  sourceMismatch.observations[0].sourceId = 'a'.repeat(64);
  assert.throws(() => validateDynamics(sourceMismatch), /source/);
  const future = structuredClone(raw);
  future.generatedAt = '2001-01-01T00:00:00.000Z';
  assert.throws(() => validateDynamics(future), /Future/);
  const mixed = structuredClone(raw);
  mixed.observations[0].frequency = 'year';
  assert.throws(() => validateDynamics(mixed), /period/);
});
test('aggregate mismatch cannot pass by preserving local equations', () => {
  const broken = structuredClone(raw);
  for (const o of broken.observations) {
    if (
      o.period === '2025' &&
      o.geography === '141097' &&
      ['births', 'natural_change', 'total_change'].includes(o.metric)
    )
      o.value++;
  }
  assert.throws(() => validateDynamics(broken), /ward sum/);
});
test('all observation identities are unique and complete', () => {
  assert.equal(new Set(data.observations.map(dynamicsKey)).size, data.observations.length);
  assert.ok(data.observations.some((o) => o.metric === 'natural_change' && o.value < 0));
  const broken = structuredClone(raw);
  const births = broken.observations.find((o) => o.metric === 'births');
  assert.ok(births);
  births.value = -1;
  assert.throws(() => validateDynamics(broken), /Negative/);
});
