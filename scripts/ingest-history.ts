import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import {
  type HistoryDataset,
  type HistorySource,
  parseHistory,
  validateHistory,
} from '../packages/warehouse/history.ts';
import { bytesHash } from '../packages/warehouse/model.ts';
import { atomic } from '../packages/warehouse/storage.ts';

const registry = JSON.parse(await readFile('data/catalog/history-sources.json', 'utf8')) as {
  snapshots: HistorySource[];
};
await mkdir('artifacts', { recursive: true });
await mkdir('data/candidates', { recursive: true });
await rm('data/candidates/history.json', { force: true });
let previous: HistoryDataset | undefined;
try {
  previous = validateHistory(JSON.parse(await readFile('data/published/history.json', 'utf8')));
} catch (e) {
  if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
}
try {
  const snapshots: HistorySource[] = [],
    records: HistoryDataset['records'] = [];
  for (const spec of registry.snapshots) {
    if (new URL(spec.url).origin !== 'https://www.city.yokohama.lg.jp')
      throw new Error('Unapproved history source');
    const response = await fetch(spec.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || !response.body) throw new Error(`History source HTTP ${response.status}`);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 3000000) throw new Error('History source exceeds 3 MB');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks),
      id = bytesHash(bytes),
      path = `data/raw/${id}.csv`;
    try {
      await writeFile(path, bytes, { flag: 'wx' });
    } catch (e) {
      if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e;
      if (bytesHash(await readFile(path)) !== id) throw new Error('History original corrupted');
    }
    const old = previous?.snapshots.find((s) => s.series === spec.series);
    const source =
      old?.id === id
        ? old
        : spec.id === id
          ? spec
          : { ...spec, id, sha256: id, path, retrievedAt: new Date().toISOString() };
    snapshots.push(source);
    records.push(...parseHistory(bytes, source));
  }
  const unchanged = previous && JSON.stringify(snapshots) === JSON.stringify(previous.snapshots);
  const data = validateHistory({
    schemaVersion: 1,
    generatedAt: unchanged && previous ? previous.generatedAt : new Date().toISOString(),
    snapshots,
    records,
  });
  await atomic('.', 'data/candidates/history.json', data);
  await atomic('.', 'artifacts/history-ingestion-report.json', {
    status: unchanged ? 'unchanged' : 'candidate',
    checkedAt: new Date().toISOString(),
    records: records.length,
  });
  console.log(`History candidate: ${records.length} values; published release unchanged.`);
} catch (error) {
  await atomic('.', 'artifacts/history-ingestion-failure.json', {
    checkedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : 'Unknown failure',
  });
  throw error;
}
