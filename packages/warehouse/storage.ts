import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { geographies } from '../core/schema.ts';
import { canonical } from '../factcheck/engine.ts';
import { parseAges } from '../ingestion/ages.ts';
import { parseDynamics } from '../ingestion/dynamics.ts';
import { decodeCsv, parsePopulation } from '../ingestion/population.ts';
import { definitions, type Inputs, normalize, restoreLegacy, validateInputs } from './adapter.ts';
import { type Article, buildArticles, impactedArticles } from './articles.ts';
import { parseHistory } from './history.ts';
import {
  bytesHash,
  datasetIds,
  diffFacts,
  type Fact,
  factSchema,
  hash,
  hashSchema,
} from './model.ts';

const codeFiles = [
  'packages/warehouse/model.ts',
  'packages/warehouse/adapter.ts',
  'packages/warehouse/articles.ts',
  'packages/warehouse/history.ts',
  'packages/warehouse/storage.ts',
  'data/catalog/quality-issues.json',
  'data/catalog/history-sources.json',
  'data/catalog/basis-approvals.json',
];
export type Manifest = {
  schemaVersion: 1;
  datasets: { id: string; object: string }[];
  metadata: string;
  catalog: string;
  articles: string;
  implementation: string;
};
const json = async (root: string, path: string) =>
  JSON.parse(await readFile(resolve(root, path), 'utf8'));
export async function atomic(root: string, path: string, value: unknown) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  const encoded = `${JSON.stringify(value)}\n`;
  try {
    if ((await readFile(target, 'utf8')) === encoded) return;
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
  }
  const tmp = `${target}.tmp`;
  await writeFile(tmp, encoded);
  await rename(tmp, target);
}
async function immutable(root: string, path: string, value: unknown) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  const text = canonical(value);
  try {
    await writeFile(target, text, { flag: 'wx' });
  } catch (e) {
    if (!(e instanceof Error && 'code' in e && e.code === 'EEXIST')) throw e;
    if ((await readFile(target, 'utf8')) !== text)
      throw new Error('Immutable warehouse object corrupted');
  }
}
async function object(root: string, value: unknown) {
  const id = hash(value);
  await immutable(root, `data/warehouse/objects/${id}.json`, value);
  return id;
}
async function readObject(root: string, id: string) {
  hashSchema.parse(id);
  const bytes = await readFile(resolve(root, `data/warehouse/objects/${id}.json`));
  if (bytesHash(bytes) !== id) throw new Error('Warehouse object hash mismatch');
  return JSON.parse(bytes.toString());
}
export async function pointer(root: string): Promise<string | undefined> {
  try {
    return hashSchema.parse((await json(root, 'data/published/warehouse.json')).releaseId);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return;
    throw e;
  }
}
export async function publishedReleaseIds(root: string): Promise<string[]> {
  const current = await json(root, 'data/published/warehouse.json');
  const ids = hashSchema.array().parse(current.releases ?? [current.releaseId]);
  if (!ids.includes(current.releaseId) || new Set(ids).size !== ids.length)
    throw new Error('Invalid adopted release history');
  return ids;
}
export async function loadRelease(root: string, id: string) {
  hashSchema.parse(id);
  const bytes = await readFile(resolve(root, `data/releases/${id}/manifest.json`));
  if (bytesHash(bytes) !== id) throw new Error('Release manifest hash mismatch');
  const manifest = JSON.parse(bytes.toString()) as Manifest;
  if (
    manifest.schemaVersion !== 1 ||
    new Set(manifest.datasets.map((s) => s.id)).size !== manifest.datasets.length ||
    manifest.datasets.some((s) => !datasetIds.includes(s.id as (typeof datasetIds)[number]))
  )
    throw new Error('Invalid release schema');
  const facts: Fact[] = [];
  for (const shard of manifest.datasets)
    facts.push(...factSchema.array().parse(await readObject(root, shard.object)));
  if (new Set(facts.map((f) => f.key)).size !== facts.length)
    throw new Error('Duplicate release keys');
  const metadata = (await readObject(root, manifest.metadata)) as Inputs;
  const articles = (await readObject(root, manifest.articles)) as Article[];
  const catalog = await readObject(root, manifest.catalog);
  await readObject(root, manifest.implementation);
  return { releaseId: id, manifest, facts, metadata, articles, catalog };
}
export async function validateOriginals(
  root: string,
  input: Inputs,
  pinned?: {
    referenceNotes?: {
      dynamics: { path: string; sha256: string };
      history: { path: string; sha256: string } | null;
    };
    basisApprovals?: { sources: Record<string, string[]> };
    qualityIssues?: unknown;
  },
) {
  validateInputs(input);
  const approvals =
    pinned?.basisApprovals ?? (await json(root, 'data/catalog/basis-approvals.json'));
  for (const family of ['population', 'dynamics', 'ages', 'history'] as const) {
    const data = input[family];
    if (!data) continue;
    for (const source of data.snapshots) {
      if (!approvals.sources[family]?.includes(source.id))
        throw new Error(`Unreviewed source basis: ${family}:${source.id}`);
      if (
        source.id !== source.sha256 ||
        source.path !== `data/raw/${source.id}.csv` ||
        new URL(source.url).hostname !== 'www.city.yokohama.lg.jp'
      )
        throw new Error('Invalid original source identity');
      const bytes = await readFile(resolve(root, source.path));
      if (bytesHash(bytes) !== source.id) throw new Error('Original hash mismatch');
      let actual: unknown, expected: unknown;
      if (family === 'population') {
        const rows = input.population.observations.filter((o) => o.sourceId === source.id);
        expected = rows;
        actual = parsePopulation(decodeCsv(bytes), source.id, rows[0]?.revision);
      } else if (family === 'dynamics') {
        const rows = input.dynamics.observations.filter((o) => o.sourceId === source.id);
        expected = rows;
        actual = parseDynamics(
          decodeCsv(bytes),
          (source as Inputs['dynamics']['snapshots'][number]).scope,
          source.id,
          rows[0]?.revision,
        );
      } else if (family === 'ages') {
        expected = input.ages.records;
        actual = parseAges(decodeCsv(bytes), source.id, input.ages.records[0].revision);
      } else {
        if (!input.history) throw new Error('Missing history input');
        expected = input.history.records.filter((r) => r.sourceId === source.id);
        actual = parseHistory(bytes, source as NonNullable<Inputs['history']>['snapshots'][number]);
      }
      if (!isDeepStrictEqual(actual, expected))
        throw new Error(`Warehouse differs from original: ${family}`);
    }
  }
  if (input.history) {
    const known = (pinned?.qualityIssues ??
      (await json(root, 'data/catalog/quality-issues.json'))) as {
      leftDataset: string;
      rightDataset: string;
      period: string;
      geography: string;
      metric: string;
      leftValue: number;
      leftSourceId: string;
      rightSourceId: string;
      rightValue: number;
    }[];
    const facts = normalize(input);
    const map = new Map(
      facts.map((f) => [`${f.dataset}:${f.period}:${f.geography}:${f.metric}`, f.value]),
    );
    for (const f of facts) {
      const other =
        f.dataset === 'historical'
          ? 'city-series'
          : f.dataset === 'city-series'
            ? 'ward-monthly'
            : f.dataset === 'population'
              ? 'ward-monthly'
              : null;
      if (other) {
        const v = map.get(`${other}:${f.period}:${f.geography}:${f.metric}`);
        if (
          v !== undefined &&
          v !== f.value &&
          !known.some(
            (k) =>
              k.leftDataset === f.dataset &&
              k.rightDataset === other &&
              k.period === f.period &&
              k.geography === f.geography &&
              k.metric === f.metric &&
              k.leftSourceId === f.sourceId &&
              input.history?.snapshots.some(
                (s) => s.series === other && s.id === k.rightSourceId,
              ) &&
              k.leftValue === f.value &&
              k.rightValue === v,
          )
        )
          throw new Error('Cross-series overlap mismatch; review source revisions');
      }
    }
  }
  const notes =
    pinned?.referenceNotes?.dynamics ?? (await json(root, 'data/references/dynamics-notes.json'));
  if (
    notes.path !== `data/raw/${notes.sha256}.xlsx` ||
    bytesHash(await readFile(resolve(root, notes.path))) !== notes.sha256
  )
    throw new Error('Definition workbook hash mismatch');
  if (input.history) {
    const notes =
      pinned?.referenceNotes?.history ??
      (await json(root, 'data/catalog/history-sources.json')).notes;
    if (
      notes.path !== `data/raw/${notes.sha256}.xlsx` ||
      bytesHash(await readFile(resolve(root, notes.path))) !== notes.sha256
    )
      throw new Error('History workbook hash mismatch');
  }
}
export async function readInputs(root: string, candidates = false): Promise<Inputs> {
  const input: Partial<Inputs> = {};
  for (const name of ['population', 'dynamics', 'ages', 'history'] as const) {
    let value: unknown;
    if (candidates)
      try {
        value = await json(root, `data/candidates/${name}.json`);
      } catch (e) {
        if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
      }
    if (value === undefined)
      try {
        value = await json(root, `data/published/${name}.json`);
      } catch (e) {
        if (name !== 'history' || !(e instanceof Error && 'code' in e && e.code === 'ENOENT'))
          throw e;
      }
    if (value !== undefined) Object.assign(input, { [name]: value });
  }
  return validateInputs(input as Inputs);
}
async function implementation(root: string) {
  return Object.fromEntries(
    await Promise.all(codeFiles.map(async (p) => [p, bytesHash(await readFile(resolve(root, p)))])),
  );
}
async function publishLocked(root: string, input: Inputs, reason?: string) {
  // Validate everything before touching the currently published pointer or compatibility files.
  await validateOriginals(root, input);
  const facts = normalize(input);
  const restored = restoreLegacy(input, facts);
  if (!isDeepStrictEqual(restored, input)) throw new Error('Compatibility roundtrip mismatch');
  const previousId = await pointer(root);
  const previous = previousId ? await loadRelease(root, previousId) : undefined;
  const changes = diffFacts(previous?.facts ?? [], facts);
  const impacts = impactedArticles(previous?.articles ?? [], changes);
  const requiresReview = changes.some((c) => c.kind === 'value' || c.kind === 'removed');
  const report = {
    previousRelease: previousId ?? null,
    requiresReview,
    changes,
    impactedArticles: impacts,
    reason: reason ?? null,
  };
  await atomic(root, 'artifacts/warehouse-candidate-report.json', report);
  if (requiresReview && !reason?.trim())
    throw new Error('Historical warehouse changes require an explicit reviewed reason');
  const snapshots = [
    ...input.population.snapshots,
    ...input.dynamics.snapshots,
    ...input.ages.snapshots,
    ...(input.history?.snapshots ?? []),
  ];
  const catalog = {
    schemaVersion: 1,
    definitions: definitions(),
    basisApprovals: await json(root, 'data/catalog/basis-approvals.json'),
    qualityIssues: await json(root, 'data/catalog/quality-issues.json'),
    referenceNotes: {
      dynamics: await json(root, 'data/references/dynamics-notes.json'),
      history: input.history ? (await json(root, 'data/catalog/history-sources.json')).notes : null,
    },
    geographies,
    sources: snapshots,
    datasets: datasetIds.flatMap((id) => {
      const rows = facts.filter((f) => f.dataset === id);
      if (!rows.length) return [];
      const periods = rows.map((f) => f.period).sort();
      return [
        {
          id,
          count: rows.length,
          from: periods[0],
          to: periods.at(-1),
          geographies: [...new Set(rows.map((f) => f.geography))],
          metrics: [...new Set(rows.map((f) => f.metric))],
        },
      ];
    }),
  };
  const metadata = structuredClone(input);
  metadata.population.observations = [];
  metadata.dynamics.observations = [];
  metadata.ages.records = [];
  if (metadata.history) metadata.history.records = [];
  const manifest: Manifest = {
    schemaVersion: 1,
    datasets: [],
    metadata: await object(root, metadata),
    catalog: await object(root, catalog),
    articles: await object(root, buildArticles(facts)),
    implementation: await object(root, await implementation(root)),
  };
  for (const id of datasetIds) {
    const rows = facts.filter((f) => f.dataset === id);
    if (rows.length) manifest.datasets.push({ id, object: await object(root, rows) });
  }
  const releaseId = hash(manifest);
  await immutable(root, `data/releases/${releaseId}/manifest.json`, manifest);
  if (previousId === releaseId) return { releaseId, status: 'unchanged', count: facts.length };
  await immutable(root, `data/warehouse/changes/${releaseId}.json`, { ...report, releaseId });
  // The manifest is durable first. On interruption, export the last pointer to recover.
  for (const [name, data] of Object.entries(restored))
    await atomic(root, `data/published/${name}.json`, data);
  await atomic(root, 'data/catalog/warehouse.json', catalog);
  await atomic(root, 'data/published/warehouse-articles.json', {
    releaseId,
    articles: buildArticles(facts),
  });
  await atomic(root, 'data/published/warehouse.json', {
    releaseId,
    releases: [...(previousId ? await publishedReleaseIds(root) : []), releaseId],
  });
  return {
    releaseId,
    status: 'published',
    count: facts.length,
    changes: changes.length,
    impactedArticles: impacts.length,
  };
}
export async function checkWarehouse(root: string) {
  const id = await pointer(root);
  if (!id) throw new Error('No warehouse release');
  const release = await loadRelease(root, id);
  const input = restoreLegacy(release.metadata, release.facts);
  await validateOriginals(root, input);
  if (!isDeepStrictEqual(normalize(input), release.facts))
    throw new Error('Warehouse normalization changed');
  if (hash(await implementation(root)) !== release.manifest.implementation)
    throw new Error('Warehouse implementation changed; publish a new release');
  if (hash(buildArticles(release.facts)) !== release.manifest.articles)
    throw new Error('Article references or calculations changed');
  const published = await readInputs(root);
  if (!isDeepStrictEqual(input, published))
    throw new Error('Published exports differ from warehouse');
  if (hash(await json(root, 'data/catalog/warehouse.json')) !== release.manifest.catalog)
    throw new Error('Published catalog mismatch');
  const articles = await json(root, 'data/published/warehouse-articles.json');
  if (articles.releaseId !== id || hash(articles.articles) !== release.manifest.articles)
    throw new Error('Published article bundle mismatch');
  return release;
}

// A local lock prevents competing publishers. A stale lock requires inspecting the stopped run.
async function withLock<T>(root: string, action: () => Promise<T>) {
  const lock = resolve(root, 'data/warehouse/publish.lock');
  await mkdir(dirname(lock), { recursive: true });
  await writeFile(lock, String(process.pid), { flag: 'wx' });
  try {
    return await action();
  } finally {
    await rm(lock);
  }
}
export async function publish(root: string, input: Inputs, reason?: string) {
  return withLock(root, async () => {
    const before = await pointer(root);
    try {
      const result = await publishLocked(root, input, reason);
      for (const name of Object.keys(input)) {
        const path = `data/candidates/${name}.json`;
        try {
          if (isDeepStrictEqual(await json(root, path), input[name as keyof Inputs]))
            await rm(resolve(root, path));
        } catch (e) {
          if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e;
        }
      }
      return result;
    } catch (error) {
      // On ordinary write failure, restore exports from the unchanged durable pointer.
      // A hard process interruption is detected by checkWarehouse and recovered with restore.
      if (before && (await pointer(root)) === before) await restorePublishedLocked(root);
      throw error;
    }
  });
}
export async function restorePublished(root: string) {
  return withLock(root, () => restorePublishedLocked(root));
}
async function restorePublishedLocked(root: string) {
  const id = await pointer(root);
  if (!id) throw new Error('No published release to restore');
  const release = await loadRelease(root, id);
  const input = restoreLegacy(release.metadata, release.facts);
  await validateOriginals(root, input, release.catalog);
  for (const [name, data] of Object.entries(input))
    await atomic(root, `data/published/${name}.json`, data);
  if (!input.history) await rm(resolve(root, 'data/published/history.json'), { force: true });
  await atomic(root, 'data/catalog/warehouse.json', release.catalog);
  await atomic(root, 'data/published/warehouse-articles.json', {
    releaseId: id,
    articles: release.articles,
  });
  return id;
}
