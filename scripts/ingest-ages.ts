import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { type AgesDataset, agesPage, agesUrl, validateAges } from '../packages/core/ages.ts';
import { parseAges } from '../packages/ingestion/ages.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';

const target = 'data/published/ages.json';
const candidate = 'data/candidates/ages.json';
await mkdir('data/candidates', { recursive: true });
await rm(candidate, { force: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
await mkdir('artifacts', { recursive: true });
await mkdir('data/raw', { recursive: true });
await mkdir('data/manifests', { recursive: true });
try {
  let previous: AgesDataset | undefined;
  try {
    previous = validateAges(JSON.parse(await readFile(target, 'utf8')));
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
  }
  const response = await fetch(agesUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'OpenYokohama/0.1 (+https://github.com/toyofukux/open-yokohama)' },
  });
  if (!response.ok || !response.body) throw new Error(`Age source HTTP ${response.status}`);
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 10000000) throw new Error('Age source exceeds 10 MB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks),
    id = hash(bytes),
    path = `data/raw/${id}.csv`;
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e;
    if (hash(await readFile(path)) !== id) throw new Error('Existing age snapshot corrupted');
  }
  const old = previous?.snapshots[0];
  const revision =
    old?.id === id
      ? (previous?.records[0].revision ?? 1)
      : (previous?.records[0].revision ?? 0) + 1;
  const source =
    old?.id === id
      ? old
      : {
          id,
          sha256: id,
          url: agesUrl,
          sourcePage: agesPage,
          title: '年齢（各歳）、行政区、男女別人口',
          path,
          retrievedAt: new Date().toISOString(),
          publishedAt: null,
          license: 'CC-BY-4.0',
          publisher: '横浜市',
          parserVersion: 'ages-csv-v1',
        };
  const data = validateAges({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    snapshots: [source],
    records: parseAges(decodeCsv(bytes), id, revision),
  });
  const oldIndex = new Map(previous?.records.map((r) => [`${r.period}:${r.geography}`, r]));
  const newIndex = new Map(data.records.map((r) => [`${r.period}:${r.geography}`, r]));
  const removed = [...oldIndex.keys()].filter((k) => !newIndex.has(k));
  const changed = data.records
    .filter((r) => {
      const old = oldIndex.get(`${r.period}:${r.geography}`);
      return old && JSON.stringify(old.values) !== JSON.stringify(r.values);
    })
    .map((r) => ({
      period: r.period,
      geography: r.geography,
      before: oldIndex.get(`${r.period}:${r.geography}`)?.values,
      after: r.values,
    }));
  const report = {
    checkedAt: data.generatedAt,
    status:
      old?.id === id
        ? 'unchanged'
        : changed.length || removed.length
          ? 'review_required'
          : 'validated',
    records: data.records.length,
    changed,
    removed,
  };
  await writeFile('artifacts/ages-ingestion-report.json', JSON.stringify(report, null, 2));
  const manifest = Buffer.from(JSON.stringify(data.snapshots, null, 2));
  const manifestPath = `data/manifests/${hash(manifest)}.json`;
  try {
    await writeFile(manifestPath, manifest, { flag: 'wx' });
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e;
    if (!manifest.equals(await readFile(manifestPath))) throw new Error('Age manifest corrupted');
  }
  if (changed.length || removed.length) {
    await writeFile('artifacts/ages-candidate.json', JSON.stringify(data));
    throw new Error('Historical ages changed; review candidate before adoption');
  }
  if (old?.id !== id) {
    await writeFile(`${candidate}.tmp`, `${JSON.stringify(data)}\n`);
    await rename(`${candidate}.tmp`, candidate);
  }
  console.log(JSON.stringify(report));
} catch (e) {
  await writeFile(
    'artifacts/ages-ingestion-failure.json',
    JSON.stringify(
      { at: new Date().toISOString(), error: e instanceof Error ? e.message : 'Unknown failure' },
      null,
      2,
    ),
  );
  throw e;
}
