import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../packages/factcheck/engine.ts';
import { queryFacts } from '../packages/warehouse/model.ts';
import {
  checkWarehouse,
  loadRelease,
  pointer,
  publish,
  readInputs,
  restorePublished,
} from '../packages/warehouse/storage.ts';

export const warehouseRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
export async function check() {
  const r = await checkWarehouse(warehouseRoot);
  console.log(
    `Verified warehouse ${r.releaseId}: ${r.facts.length} values / ${r.articles.length} versioned articles.`,
  );
  return r;
}
async function main() {
  const command = process.argv[2] ?? 'check';
  if (command === 'restore') {
    console.log(await restorePublished(warehouseRoot));
    return;
  }
  if (command === 'check') {
    await check();
    return;
  }
  if (command === 'publish') {
    const reasonIndex = process.argv.indexOf('--reason');
    console.log(
      await publish(
        warehouseRoot,
        await readInputs(warehouseRoot, true),
        reasonIndex >= 0 ? process.argv[reasonIndex + 1] : undefined,
      ),
    );
    return;
  }
  const releaseIndex = process.argv.indexOf('--release');
  const id = releaseIndex >= 0 ? process.argv[releaseIndex + 1] : await pointer(warehouseRoot);
  if (!id) throw new Error('No warehouse release');
  const release = await loadRelease(warehouseRoot, id);
  if (command === 'query') {
    const params = JSON.parse(process.argv[3] ?? '{}');
    console.log(canonical({ releaseId: id, ...queryFacts(release.facts, params) }));
    return;
  }
  if (command === 'article') {
    const id = process.argv[3];
    const article = release.articles.find((a) => a.id === id);
    if (!article) throw new Error('Unknown article');
    const versions = new Set(article.inputs.map((i) => i.version));
    const observations = release.facts.filter((f) => versions.has(f.version));
    await mkdir(resolve(warehouseRoot, 'artifacts/warehouse'), { recursive: true });
    const output = resolve(warehouseRoot, 'artifacts/warehouse/article.json');
    await writeFile(
      output,
      JSON.stringify(
        {
          releaseId: release.releaseId,
          article,
          observations,
          definitions: release.catalog.definitions.filter((d: { version: string }) =>
            observations.some((f) => f.definitionVersion === d.version),
          ),
          sources: release.catalog.sources.filter((s: { id: string }) =>
            observations.some((o) => o.sourceId === s.id),
          ),
        },
        null,
        2,
      ),
    );
    console.log(output);
    return;
  }
  if (command === 'changes') {
    console.log(
      await readFile(resolve(warehouseRoot, `data/warehouse/changes/${id}.json`), 'utf8'),
    );
    return;
  }
  throw new Error(
    'Usage: warehouse.ts check|publish [--reason ...]|query JSON|article ID|changes [--release SHA256]',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
