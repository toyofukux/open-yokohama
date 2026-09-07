import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { datasetSchema, type Snapshot, validateDataset } from '../packages/core/schema.ts';
import { decodeCsv, parsePopulation } from '../packages/ingestion/population.ts';

const page =
  'https://www.city.yokohama.lg.jp/city-info/yokohamashi/tokei-chosa/portal/opendata/suikei01.html';
const target = 'data/published/population.json';
const candidate = 'data/candidates/population.json';
await mkdir('data/candidates', { recursive: true });
await rm(candidate, { force: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fetchBounded(url: string, maxBytes: number) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.city.yokohama.lg.jp')
    throw new Error('Unapproved source host');
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': 'OpenYokohama/0.1 (+https://github.com/toyofukux/open-yokohama)',
    },
  });
  if (!response.ok || !response.body) throw new Error(`Source fetch failed: ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Source exceeds size limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
await mkdir('artifacts', { recursive: true });
try {
  let previous = null;
  try {
    previous = datasetSchema.parse(JSON.parse(await readFile(target, 'utf8')));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const html = new TextDecoder().decode(await fetchBounded(page, 1500000));
  const urls = [...html.matchAll(/href="([^"]*e1yokohama(\d{2})(\d{2})\.csv)"/g)]
    .filter((m) => Number(m[2]) >= 24)
    .map((m) => new URL(m[1], page).href);
  if (urls.length < 12 || urls.length > 200 || new Set(urls).size !== urls.length)
    throw new Error('Source discovery count invalid');
  const snapshots: Snapshot[] = [];
  const observations = [];
  for (const url of urls.sort()) {
    const bytes = await fetchBounded(url, 100000);
    const id = hash(bytes);
    const old = previous?.snapshots.find((s) => s.id === id);
    const path = `data/raw/${id}.csv`;
    const snapshot: Snapshot = old ?? {
      id,
      sha256: id,
      url,
      sourcePage: page,
      title: '男女別人口及び世帯数－行政区',
      retrievedAt: new Date().toISOString(),
      publishedAt: null,
      path,
      license: 'CC-BY-4.0',
      publisher: '横浜市',
      parserVersion: 'population-csv-v1',
    };
    const oldForUrl = previous?.snapshots.find((s) => s.url === url);
    const oldRevision =
      previous?.observations.find((o) => o.sourceId === oldForUrl?.id)?.revision ?? 0;
    const revision = oldForUrl?.id === id ? oldRevision : oldRevision + 1;
    try {
      await writeFile(path, bytes, { flag: 'wx' });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      if (hash(await readFile(path)) !== id) throw new Error('Existing snapshot corrupted');
    }
    await writeFile('artifacts/last-downloaded-source.json', JSON.stringify(snapshot, null, 2));
    const parsed = parsePopulation(decodeCsv(bytes), id, revision);
    const suffix = url.match(/e1yokohama(\d{2})(\d{2})\.csv$/);
    if (!suffix || parsed[0].period !== `20${suffix[1]}-${suffix[2]}-01`)
      throw new Error('URL and reference date mismatch');
    snapshots.push(snapshot);
    observations.push(...parsed);
  }
  const data = validateDataset({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    snapshots,
    observations,
  });
  const removed =
    previous?.observations.filter(
      (o) =>
        !data.observations.some(
          (n) => n.period === o.period && n.geography === o.geography && n.metric === o.metric,
        ),
    ) ?? [];
  if (removed.length) throw new Error('Refresh would remove historical observations');
  const changed = observations.filter((o) =>
    previous?.observations.some(
      (p) =>
        p.period === o.period &&
        p.geography === o.geography &&
        p.metric === o.metric &&
        p.value !== o.value,
    ),
  );
  const report = {
    status: 'validated',
    checkedAt: data.generatedAt,
    snapshots: snapshots.length,
    observations: observations.length,
    changed: changed.map((o) => ({ id: o.id, value: o.value })),
    requiresReview: changed.length > 0,
  };
  await writeFile('artifacts/ingestion-report.json', JSON.stringify(report, null, 2));
  const manifestId = hash(Buffer.from(JSON.stringify(snapshots)));
  try {
    await writeFile(`data/manifests/${manifestId}.json`, JSON.stringify(snapshots, null, 2), {
      flag: 'wx',
    });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  // Existing values changing require explicit inspection; never silently replace published history.
  if (changed.length) {
    await writeFile('artifacts/population-candidate.json', JSON.stringify(data));
    throw new Error(
      'Historical values changed: inspect artifacts/population-candidate.json and report before release',
    );
  }
  if (previous && JSON.stringify(previous.snapshots) === JSON.stringify(snapshots)) {
    console.log(JSON.stringify({ ...report, status: 'unchanged' }));
  } else {
    await writeFile(`${candidate}.tmp`, `${JSON.stringify(data)}\n`);
    await rename(`${candidate}.tmp`, candidate);
    console.log(JSON.stringify(report));
  }
} catch (error) {
  await writeFile(
    'artifacts/ingestion-failure.json',
    JSON.stringify(
      {
        status: 'failed',
        at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown failure',
      },
      null,
      2,
    ),
  );
  throw error;
}
