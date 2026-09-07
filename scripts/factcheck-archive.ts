import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRelease, canonical, packet } from '../packages/factcheck/engine.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';
import { ensureEvidenceCache } from './factcheck-cache.ts';
import { sourceText } from './factcheck-source.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = async (path: string) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Historical audit only. It never approves current policy articles or republishes retired pages. */
export async function checkArchive(originals = false) {
  if (originals) await ensureEvidenceCache();
  const sources = await load('data/editorial/evidence.json');
  const implementation = await load('data/editorial/implementation.json');
  for (const [path, digest] of Object.entries(implementation)) {
    assert.equal(
      hash(await readFile(resolve(root, 'data/editorial/archive', path))),
      digest,
      `Archived verifier changed: ${path}`,
    );
    // The engine interpreting the signature must still be the original verifier.
    if (path.startsWith('packages/factcheck/'))
      assert.equal(hash(await readFile(resolve(root, path))), digest, `Verifier changed: ${path}`);
  }
  for (const source of sources) {
    if (source.tier === 'internal') {
      const path = new URL(source.url).pathname.split('/blob/main/')[1];
      assert.ok(path && !path.includes('..'));
      source.text = await readFile(resolve(root, 'data/editorial/archive', path), 'utf8');
    } else if (originals) {
      assert.equal(new URL(source.url).hostname, 'www.city.yokohama.lg.jp');
      assert.match(
        source.artifact.path,
        /^data\/(?:editorial\/raw\/[a-f0-9]{64}\.html|raw\/[a-f0-9]{64}\.csv)$/,
      );
      const raw = await readFile(resolve(root, source.artifact.path));
      assert.equal(
        hash(raw),
        source.artifact.sha256,
        'Evidence differs from the immutable original',
      );
      assert.equal(
        source.artifact.path.endsWith('.csv') ? decodeCsv(raw) : sourceText(raw.toString('utf8')),
        source.text,
        'Evidence differs from the immutable original',
      );
    }
  }
  const candidates = await load('data/editorial/issues.json');
  assert.deepEqual(candidates.map((i: { slug: string }) => i.slug).sort(), [
    'density',
    'households',
    'population',
  ]);
  const input = packet(
    candidates,
    sources,
    await load('data/editorial/policy.json'),
    implementation,
  );
  const review = await load('data/editorial/review.json');
  const result = assertRelease(
    input,
    review,
    await load('data/editorial/reviewers.json'),
    new Date(review.report.reviewedAt),
  );
  assert.equal(
    canonical(await load('data/published/editorial.json')),
    canonical({
      ...result,
      sources: sources.map(({ text: _text, ...source }: { text: string }) => source),
    }),
    'Published editorial data differs from verified archive',
  );
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const originals = process.argv.includes('--originals');
  const result = await checkArchive(originals);
  console.log(
    `Archived ${result.issues.length} retired articles / ${result.claims.length} signed claims verified${originals ? ' with pinned originals' : ' as historical records'}. No current publication approval.`,
  );
}
