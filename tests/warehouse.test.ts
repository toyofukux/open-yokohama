import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { normalize, restoreLegacy } from '../packages/warehouse/adapter.ts';
import { buildArticles, calculate, impactedArticles } from '../packages/warehouse/articles.ts';
import { parseHistory, validateHistory } from '../packages/warehouse/history.ts';
import { diffFacts, identity, queryFacts } from '../packages/warehouse/model.ts';
import {
  checkWarehouse,
  loadRelease,
  pointer,
  publish,
  publishedReleaseIds,
  readInputs,
  restorePublished,
  validateOriginals,
} from '../packages/warehouse/storage.ts';

const input = await readInputs('.');
const facts = normalize(input);
const history = input.history;
if (!history) throw new Error('History not published');

test('warehouse preserves every legacy value and original row through normalization', async () => {
  assert.equal(facts.length, 44638);
  assert.deepEqual(restoreLegacy(input, facts), input);
  await validateOriginals('.', input);
  assert.equal(new Set(facts.map((f) => f.key)).size, facts.length);
});
test('long history has official coverage, no invented gap years and explicit provisional basis', () => {
  const city = queryFacts(facts, {
    dataset: 'historical',
    geography: '141003',
    metric: 'population',
    limit: 100,
  });
  assert.equal(city.observations[0].period, '1920-10-01');
  assert.equal(
    city.observations.some((f) => f.period.startsWith('1945')),
    false,
  );
  assert.equal(
    city.observations.some((f) => f.period.startsWith('1991')),
    false,
  );
  assert.equal(city.observations.find((f) => f.period === '1995-10-01')?.value, 3307136);
  assert.equal(city.observations.at(-1)?.value, 3771063);
  assert.match(
    queryFacts(facts, {
      dataset: 'city-series',
      geography: '141003',
      metric: 'population',
      from: '1979',
      to: '1979',
    }).observations[0].geographyBasis,
    /当時/,
  );
  const monthly = queryFacts(facts, {
    dataset: 'city-series',
    geography: '141003',
    metric: 'population',
    from: '2025-09',
    to: '2025-10',
  }).observations;
  assert.equal(monthly[1].value - monthly[0].value, -17480);
  assert.equal(monthly[1].provisional, true);
  assert.match(monthly[1].basis, /速報/);
});
test('history rejects missing values, physical-row shifts, missing years and broken sums', async () => {
  const source = history.snapshots[0];
  const bytes = await readFile(source.path);
  const text = new TextDecoder('utf-8').decode(bytes);
  // The official CSV is UTF-8 with BOM; retain the original encoding for mutation.
  assert.throws(() => parseHistory(Buffer.from(text.replace(/\r?\n/, '\n\n')), source));
  const withoutYear = structuredClone(history);
  withoutYear.records = withoutYear.records.filter(
    (r) => !(r.dataset === 'historical' && r.period === '1947-10-01'),
  );
  assert.throws(() => validateHistory(withoutYear), /Missing census year/);
  const changed = structuredClone(history);
  const city = changed.records.find(
    (r) =>
      r.dataset === 'historical' &&
      r.geography === '141003' &&
      r.period === '1995-10-01' &&
      r.metric === 'population',
  );
  assert.ok(city);
  city.value += 1;
  assert.throws(() => validateHistory(changed));
  const missing = structuredClone(history);
  missing.records.pop();
  assert.throws(() => validateHistory(missing), /Incomplete/);
});
test('stable keys distinguish revisions and identify affected articles', () => {
  const old = facts.find(
    (f) =>
      f.dataset === 'historical' &&
      f.geography === '141003' &&
      f.period === '2024-10-01' &&
      f.metric === 'population',
  );
  assert.ok(old);
  const revised = identity({ ...old, value: old.value + 1, sourceId: 'a'.repeat(64) });
  assert.equal(revised.key, old.key);
  assert.notEqual(revised.version, old.version);
  const changes = diffFacts([old], [revised]);
  assert.equal(changes[0].kind, 'value');
  assert.ok(
    impactedArticles(buildArticles(facts), changes).some(
      (a) => a.articleId === 'population-history/yokohama',
    ),
  );
});
test('article calculations replay from pinned inputs with comparable periods and denominators', () => {
  const index = new Map(facts.map((f) => [f.version, f]));
  for (const a of buildArticles(facts)) {
    for (const c of a.calculations) {
      const rows = c.inputs.map((v) => {
        const f = index.get(v);
        assert.ok(f);
        return f;
      });
      assert.deepEqual(calculate(c.operation, rows), c);
    }
    for (const s of a.sections)
      for (const chart of s.charts)
        for (const p of chart.points) {
          assert.equal(index.get(p.version)?.value, p.value);
          assert.ok(a.inputs.some((i) => i.version === p.version));
        }
    const macro = a.sections.find((s) => s.id === 'population');
    assert.ok(macro);
    assert.equal(macro.charts[0].points[0].period, '1995-10-01');
    assert.match(a.sections.find((s) => s.id === 'monthly')?.cautions.join(' ') ?? '', /基準/);
  }
  const sample = facts.filter(
    (f) =>
      f.dataset === 'dynamics' &&
      f.geography === '141003' &&
      f.metric === 'births' &&
      f.frequency === 'year',
  );
  assert.throws(() => calculate('mean', [sample[0], sample[2]]), /consecutive/);
});
test('queries page at 500 rows, reject invalid bounds, and never turn unavailable into zero', () => {
  const q = {
    dataset: 'city-series' as const,
    geography: '141003',
    metric: 'population',
    from: '2000',
    limit: 10,
  };
  const a = queryFacts(facts, q),
    b = queryFacts(facts, { ...q, offset: 10 });
  assert.equal(a.observations.length, 10);
  assert.equal(a.nextOffset, 10);
  assert.ok(a.observations.at(-1)?.period !== b.observations[0].period);
  assert.throws(() => queryFacts(facts, { ...q, limit: 501 }));
  assert.throws(() => queryFacts(facts, { ...q, from: '2026-99' }));
  assert.throws(() => queryFacts(facts, { ...q, from: '2026', to: '2000' }));
  assert.deepEqual(queryFacts(facts, { ...q, from: '1900', to: '1901' }).observations, []);
  assert.equal(queryFacts(facts, { ...q, from: '1900', to: '1901' }).unavailable, true);
});
test('durable releases survive failed export, reject tampering and serialize restore', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'yokohama-dwh-'));
  try {
    await cp('data', resolve(root, 'data'), {
      recursive: true,
      filter: (p) => !p.includes('/editorial') && !p.includes('/candidates'),
    });
    await symlink(resolve('packages'), resolve(root, 'packages'), 'dir');
    const id = await pointer(root);
    assert.ok(id);
    const old = await loadRelease(root, id);
    const adopted = await publishedReleaseIds(root);
    const legacy = await readFile(resolve(root, 'data/published/population.json'), 'utf8');
    const altered = structuredClone(input);
    altered.population.generatedAt = new Date(
      Date.parse(altered.population.generatedAt) + 1000,
    ).toISOString();
    const fail = resolve(root, 'data/published/warehouse-articles.json.tmp');
    await mkdir(fail);
    await assert.rejects(publish(root, altered));
    assert.equal(await pointer(root), id);
    assert.deepEqual(await publishedReleaseIds(root), adopted);
    assert.equal(await readFile(resolve(root, 'data/published/population.json'), 'utf8'), legacy);
    const candidates = (await readdir(resolve(root, 'data/releases'))).filter(
      (r) => !adopted.includes(r),
    );
    assert.ok(candidates.length > 0, 'Fault occurred after a candidate manifest was persisted');
    const originalCwd = process.cwd();
    try {
      process.chdir(root);
      const api = await import('../apps/web/src/pages/data/warehouse/[...path].ts');
      const routes = await api.getStaticPaths();
      for (const candidate of candidates)
        assert.equal(
          routes.some((r) => r.params.path === `releases/${candidate}/manifest.json`),
          false,
        );
      const orphan = 'f'.repeat(64);
      await writeFile(resolve(root, `data/warehouse/objects/${orphan}.json`), '{}');
      assert.equal(
        (await api.getStaticPaths()).some((r) => r.params.path === `objects/${orphan}.json`),
        false,
      );
    } finally {
      process.chdir(originalCwd);
    }
    await rm(fail, { recursive: true });
    await checkWarehouse(root);
    await publish(root, altered);
    assert.notEqual(await pointer(root), id);
    assert.deepEqual((await loadRelease(root, id)).articles, old.articles);
    const lock = resolve(root, 'data/warehouse/publish.lock');
    await writeFile(lock, 'occupied');
    await assert.rejects(restorePublished(root), /EEXIST/);
    await rm(lock);
    const shard = resolve(root, `data/warehouse/objects/${old.manifest.datasets[0].object}.json`);
    await writeFile(shard, '[]');
    await assert.rejects(loadRelease(root, id), /hash mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('unreviewed source versions cannot be adopted even if a key or reason exists', async () => {
  const candidate = structuredClone(input);
  candidate.population.snapshots[0].id = 'f'.repeat(64);
  await assert.rejects(validateOriginals('.', candidate));
});
