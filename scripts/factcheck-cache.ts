import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceSchema } from '../packages/factcheck/schema.ts';
import { root } from './factcheck.ts';
import { fetchOriginal } from './factcheck-fetch.ts';
import { sourceText } from './factcheck-source.ts';

/** Restore pinned originals for a clean checkout. No AI or signing credentials are used. */
export async function ensureEvidenceCache() {
  const sources = sourceSchema
    .array()
    .parse(JSON.parse(await readFile(resolve(root, 'data/editorial/evidence.json'), 'utf8')));
  for (const source of sources) {
    if (!source.artifact?.path.endsWith('.html')) continue;
    const dest = resolve(root, source.artifact.path);
    const exists = await access(dest).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return false;
      },
    );
    if (exists) continue;
    const raw = await fetchOriginal(source.url);
    if (
      createHash('sha256').update(raw).digest('hex') !== source.artifact.sha256 ||
      sourceText(raw.toString('utf8')) !== source.text
    ) {
      throw new Error(`Pinned original changed: ${source.id}; refresh sources and review again`);
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, raw, { flag: 'wx' });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureEvidenceCache();
}
