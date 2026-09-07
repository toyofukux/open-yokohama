import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sourceSchema } from '../packages/factcheck/schema.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';
import { root } from './factcheck.ts';
import { fetchOriginal } from './factcheck-fetch.ts';
import { sourceText } from './factcheck-source.ts';

const checkOnly = process.argv.includes('--check');
const path = resolve(root, 'data/editorial/evidence.json');
const sources = sourceSchema.array().parse(JSON.parse(await readFile(path, 'utf8')));
const internal = new Set([
  'packages/core/schema.ts',
  'packages/core/query.ts',
  'apps/web/src/pages/wards/index.astro',
  'apps/web/src/pages/wards/[ward].astro',
  'apps/web/src/scripts/comparison.ts',
  'apps/web/src/components/Trend.astro',
  'apps/web/src/pages/issues/[slug].astro',
]);
let changed = 0;
for (const source of sources) {
  if (source.tier === 'internal') {
    const file = new URL(source.url).pathname.split('/blob/main/')[1];
    if (!internal.has(file)) throw new Error('Unknown product evidence');
    source.text = await readFile(resolve(root, file), 'utf8');
  } else {
    const raw = await fetchOriginal(source.url);
    const hash = createHash('sha256').update(raw).digest('hex');
    if (source.artifact?.path.endsWith('.csv')) {
      if (hash !== source.artifact.sha256)
        throw new Error('CSV revised; use the population data revision workflow first');
      source.text = decodeCsv(raw);
    } else {
      source.text = sourceText(raw.toString('utf8'));
      const artifact = { path: `data/editorial/raw/${hash}.html`, sha256: hash };
      if (!checkOnly) {
        await mkdir(dirname(resolve(root, artifact.path)), { recursive: true });
        await writeFile(resolve(root, artifact.path), raw, { flag: 'wx' }).catch(
          async (error: NodeJS.ErrnoException) => {
            if (
              error.code !== 'EEXIST' ||
              !(await readFile(resolve(root, artifact.path))).equals(raw)
            )
              throw error;
          },
        );
      }
      source.artifact = artifact;
    }
  }
  const hash = createHash('sha256').update(source.text).digest('hex');
  if (hash !== source.contentHash) changed++;
  source.contentHash = hash;
  source.retrievedAt = new Date().toISOString();
}
if (checkOnly) {
  console.log(`${sources.length} sources checked; ${changed} changed. No files modified.`);
  if (changed) process.exitCode = 1;
} else {
  // All originals must succeed before replacing the candidate evidence registry.
  await writeFile(path, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Refreshed ${sources.length} sources; run factcheck:review before publishing.`);
}
