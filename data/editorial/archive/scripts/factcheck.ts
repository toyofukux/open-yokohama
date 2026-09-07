import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRelease, assess, canonical, digest, packet } from '../packages/factcheck/engine.ts';
import {
  assessmentSchema,
  type Envelope,
  extractionSchema,
  type Report,
} from '../packages/factcheck/schema.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';
import { runStage } from './factcheck-provider.ts';
import { sourceText } from './factcheck-source.ts';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = async (path: string) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
export async function loadPacket() {
  const sources = await load('data/editorial/evidence.json');
  const implementation: Record<string, string> = {};
  for (const path of [
    'packages/factcheck/schema.ts',
    'packages/factcheck/engine.ts',
    'scripts/factcheck-provider.ts',
    'scripts/factcheck-source.ts',
    'scripts/factcheck.ts',
    'packages/ingestion/population.ts',
  ]) {
    implementation[path] = createHash('sha256')
      .update(await readFile(resolve(root, path)))
      .digest('hex');
  }
  // Product claims are checked against current source code, never a hand-written capability summary.
  for (const source of sources) {
    if (source.tier !== 'internal') {
      if (
        new URL(source.url).hostname !== 'www.city.yokohama.lg.jp' ||
        !source.artifact ||
        !/^data\/(?:editorial\/raw\/[a-f0-9]{64}\.html|raw\/[a-f0-9]{64}\.csv)$/.test(
          source.artifact.path,
        )
      )
        throw new Error('Unapproved evidence origin');
      const raw = await readFile(resolve(root, source.artifact.path));
      if (
        createHash('sha256').update(raw).digest('hex') !== source.artifact.sha256 ||
        (source.artifact.path.endsWith('.csv')
          ? decodeCsv(raw)
          : sourceText(raw.toString('utf8'))) !== source.text
      )
        throw new Error('Evidence differs from the immutable original');
    }
    if (source.tier === 'internal') {
      const path = new URL(source.url).pathname.split('/blob/main/')[1];
      if (
        ![
          'packages/core/schema.ts',
          'packages/core/query.ts',
          'apps/web/src/pages/wards/index.astro',
          'apps/web/src/pages/wards/[ward].astro',
          'apps/web/src/scripts/comparison.ts',
          'apps/web/src/components/Trend.astro',
          'apps/web/src/pages/issues/[slug].astro',
        ].includes(path)
      )
        throw new Error('Unknown product evidence path');
      source.text = await readFile(resolve(root, path), 'utf8');
    }
  }
  return packet(
    await load('data/editorial/issues.json'),
    sources,
    await load('data/editorial/policy.json'),
    implementation,
  );
}
export async function checkRelease() {
  const input = await loadPacket();
  if (
    canonical(input.implementation) !== canonical(await load('data/editorial/implementation.json'))
  )
    throw new Error('Verifier implementation changed; review again');
  const envelope = await load('data/editorial/review.json');
  const result = assertRelease(input, envelope, await load('data/editorial/reviewers.json'));
  const published = await load('data/published/editorial.json');
  const expected = {
    ...result,
    sources: input.sources.map(({ text: _text, ...source }) => source),
  };
  if (canonical(published) !== canonical(expected))
    throw new Error('Published editorial data differs from verified release');
  return result;
}
async function atomicJson(path: string, value: unknown) {
  const dest = resolve(root, path);
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, dest);
}
async function main() {
  const command = process.argv[2] ?? 'check';
  if (command === 'check') {
    const result = await checkRelease();
    console.log(
      `Verified ${result.issues.length} articles / ${result.claims.length} claims; ${result.method}.`,
    );
    return;
  }
  if (command === 'keygen') {
    const existingTrust = await access(resolve(root, 'data/editorial/reviewers.json')).then(
      () => true,
      () => false,
    );
    if (existingTrust)
      throw new Error(
        'Reviewer registry already exists; use the authorized reviewer key or review a key rotation',
      );
    const dest = resolve(root, '.git/factcheck-reviewer.pem');
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    await writeFile(dest, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
      flag: 'wx',
      mode: 0o600,
    });
    await atomicJson('data/editorial/reviewers.json', [
      {
        id: 'codex-editorial-review',
        role: 'machine',
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
      },
    ]);
    console.log('Created a local MACHINE reviewer key; no human approval identity was created.');
    return;
  }
  const input = await loadPacket();
  if (command === 'prepare') {
    await atomicJson('artifacts/factcheck/packet.json', input);
    console.log(
      `Prepared ${input.blocks.length} blocks / ${input.sources.length} evidence sources.`,
    );
    return;
  }
  if (command !== 'review') throw new Error('Usage: factcheck.ts check|prepare|review|keygen');
  // Only the explicit review command invokes a model. Build/check remain offline.
  async function runArticles<T>(operation: (issue: (typeof input.issues)[number]) => Promise<T>) {
    const results: T[] = [];
    for (let offset = 0; offset < input.issues.length; offset += 3) {
      results.push(...(await Promise.all(input.issues.slice(offset, offset + 3).map(operation))));
    }
    return results;
  }
  const extractionParts = await runArticles(async (issue) => {
    const part = {
      ...input,
      issues: [issue],
      blocks: input.blocks.filter((b) => b.id.startsWith(`${issue.slug}.`)),
    };
    const output = extractionSchema.parse(await runStage('extract', part));
    return output.claims.map((claim) => ({ ...claim, id: `${issue.slug}/${claim.id}` }));
  });
  const extraction = extractionSchema.parse({ claims: extractionParts.flat() });
  async function assessArticles(stage: 'verify' | 'challenge') {
    const parts = await runArticles(async (issue) => {
      const part = {
        ...input,
        issues: [issue],
        blocks: input.blocks.filter((b) => b.id.startsWith(`${issue.slug}.`)),
      };
      return assessmentSchema.parse(
        await runStage(
          stage,
          part,
          extraction.claims.filter((c) => c.blockId.startsWith(`${issue.slug}.`)),
        ),
      );
    });
    return assessmentSchema.parse({
      coverageComplete: parts.every((p) => p.coverageComplete),
      coverageRationale: parts.map((p) => p.coverageRationale).join('\n'),
      missingClaims: parts.flatMap((p) => p.missingClaims),
      judgments: parts.flatMap((p) => p.judgments),
    });
  }
  await atomicJson('artifacts/factcheck/extraction.json', {
    packetHash: digest(input),
    extraction,
  });
  console.log(`Extracted ${extraction.claims.length} claims; verifying evidence.`);
  const verification = await assessArticles('verify');
  await atomicJson('artifacts/factcheck/verification.json', {
    packetHash: digest(input),
    verification,
  });
  console.log('Evidence verification complete; starting blind challenge.');
  const challenge = await assessArticles('challenge');
  const report: Report = {
    schemaVersion: 1,
    packetHash: digest(input),
    reviewer: 'codex-editorial-review',
    reviewerRole: 'machine',
    reviewedAt: new Date().toISOString(),
    provider: 'codex-cli / default model / isolated sessions',
    runs: [extraction, verification, challenge].map((output, i) => ({
      stage: (['extract', 'verify', 'challenge'] as const)[i],
      runId: randomUUID(),
      outputHash: digest(output),
    })),
    extraction,
    verification,
    challenge,
  };
  await atomicJson('artifacts/factcheck/candidate-review.json', report);
  const assessment = assess(input, report);
  if (assessment.errors.length) throw new Error(`Review blocked: ${assessment.errors.join('; ')}`);
  const privateKey = await readFile(resolve(root, '.git/factcheck-reviewer.pem'));
  const envelope: Envelope = {
    report,
    signature: sign(null, Buffer.from(canonical(report)), privateKey).toString('base64'),
  };
  const verified = assertRelease(input, envelope, await load('data/editorial/reviewers.json'));
  // Require a second check immediately before writing; source edits during a model run invalidate it.
  if (digest(await loadPacket()) !== report.packetHash)
    throw new Error('Inputs changed during review');
  await atomicJson('data/editorial/implementation.json', input.implementation);
  await atomicJson('data/editorial/review.json', envelope);
  await atomicJson('data/published/editorial.json', {
    ...verified,
    sources: input.sources.map(({ text: _text, ...source }) => source),
  });
  console.log(
    `Accepted ${verified.claims.length} claims after three stages; AI review, not human approval.`,
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
