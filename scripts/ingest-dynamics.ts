import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import {
  type DynamicsDataset,
  dynamicsKey,
  dynamicsPage,
  dynamicsSources,
  validateDynamics,
} from '../packages/core/dynamics.ts';
import { parseDynamics } from '../packages/ingestion/dynamics.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';

const target = 'data/published/dynamics.json';
const candidate = 'data/candidates/dynamics.json';
await mkdir('data/candidates', { recursive: true });
await rm(candidate, { force: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fetchSource(url: string) {
  if (!dynamicsSources.some((s) => new URL(`02.files/${s.file}`, dynamicsPage).href === url))
    throw new Error('Unapproved dynamics URL');
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'OpenYokohama/0.1 (+https://github.com/toyofukux/open-yokohama)' },
  });
  if (!response.ok || !response.body) throw new Error(`Dynamics fetch failed: ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 3000000) throw new Error('Dynamics source exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
await mkdir('artifacts', { recursive: true });
await mkdir('data/raw', { recursive: true });
await mkdir('data/manifests', { recursive: true });
try {
  let previous: DynamicsDataset | undefined;
  try {
    previous = validateDynamics(JSON.parse(await readFile(target, 'utf8')));
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
  }
  const snapshots: DynamicsDataset['snapshots'] = [];
  const observations: DynamicsDataset['observations'] = [];
  for (const spec of dynamicsSources) {
    const url = new URL(`02.files/${spec.file}`, dynamicsPage).href;
    const bytes = await fetchSource(url);
    const id = hash(bytes);
    const path = `data/raw/${id}.csv`;
    try {
      await writeFile(path, bytes, { flag: 'wx' });
    } catch (e) {
      if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e;
      if (hash(await readFile(path)) !== id)
        throw new Error('Existing dynamics snapshot corrupted');
    }
    const old = previous?.snapshots.find((s) => s.scope === spec.scope);
    const snapshot =
      old?.id === id
        ? old
        : {
            id,
            sha256: id,
            path,
            url,
            sourcePage: dynamicsPage,
            title: spec.title,
            scope: spec.scope,
            retrievedAt: new Date().toISOString(),
            publishedAt: null,
            license: 'CC-BY-4.0' as const,
            publisher: '横浜市' as const,
            parserVersion: 'dynamics-csv-v1' as const,
          };
    const oldRevision = previous?.observations.find((o) => o.sourceId === old?.id)?.revision ?? 0;
    observations.push(
      ...parseDynamics(
        decodeCsv(bytes),
        spec.scope,
        id,
        old?.id === id ? oldRevision : oldRevision + 1,
      ),
    );
    snapshots.push(snapshot);
  }
  const data = validateDynamics({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    snapshots,
    observations,
  });
  const oldIndex = new Map(previous?.observations.map((o) => [dynamicsKey(o), o]));
  const newIndex = new Map(observations.map((o) => [dynamicsKey(o), o]));
  const removed = [...oldIndex.keys()].filter((k) => !newIndex.has(k));
  const changed = observations
    .filter((o) => {
      const old = oldIndex.get(dynamicsKey(o));
      return old && old.value !== o.value;
    })
    .map((o) => ({
      key: dynamicsKey(o),
      before: oldIndex.get(dynamicsKey(o))?.value,
      after: o.value,
    }));
  const unchanged = previous && JSON.stringify(previous.snapshots) === JSON.stringify(snapshots);
  const report = {
    checkedAt: data.generatedAt,
    status: unchanged
      ? 'unchanged'
      : changed.length || removed.length
        ? 'review_required'
        : 'validated',
    observations: observations.length,
    added: observations.filter((o) => !oldIndex.has(dynamicsKey(o))).length,
    changed,
    removed,
  };
  await writeFile('artifacts/dynamics-ingestion-report.json', JSON.stringify(report, null, 2));
  const manifest = Buffer.from(JSON.stringify(snapshots, null, 2));
  const manifestPath = `data/manifests/${hash(manifest)}.json`;
  try {
    await writeFile(manifestPath, manifest, { flag: 'wx' });
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e;
    if (hash(await readFile(manifestPath)) !== hash(manifest))
      throw new Error('Dynamics manifest corrupted');
  }
  if (changed.length || removed.length) {
    await writeFile('artifacts/dynamics-candidate.json', `${JSON.stringify(data)}\n`);
    throw new Error('Historical dynamics changed; inspect candidate and report before adoption');
  }
  if (!unchanged) {
    await writeFile(`${candidate}.tmp`, `${JSON.stringify(data)}\n`);
    await rename(`${candidate}.tmp`, candidate);
  }
  console.log(JSON.stringify(report));
} catch (e) {
  await writeFile(
    'artifacts/dynamics-ingestion-failure.json',
    JSON.stringify(
      { at: new Date().toISOString(), error: e instanceof Error ? e.message : 'Unknown failure' },
      null,
      2,
    ),
  );
  throw e;
}
