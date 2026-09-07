import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Test actual entry points in a disposable checkout, never mutate the working tree.
const dir = await mkdtemp(join(tmpdir(), 'yokohama-gate-'));
try {
  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'packages',
    'scripts',
    'data',
    'apps',
    'docs',
  ]) {
    await cp(resolve(path), join(dir, path), {
      recursive: true,
      filter: (p) => !p.includes('/.wrangler') && !p.includes('/node_modules'),
    });
  }
  await symlink(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  await rm(join(dir, 'data/editorial/raw'), { recursive: true, force: true });
  const clean = spawnSync('pnpm', ['factcheck:check'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(clean.error, undefined);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  console.log(
    'Clean checkout verified the retired signed archive and current publication contract without AI credentials.',
  );
  const path = join(dir, 'data/editorial/issues.json');
  const original = await readFile(path, 'utf8');
  const issues = JSON.parse(original);
  issues[0].summary += '未検証の追記。';
  await writeFile(path, JSON.stringify(issues));
  for (const args of [
    ['factcheck:check'],
    ['exec', 'astro', 'build', '--root', 'apps/web'],
    ['exec', 'wrangler', 'deploy', '--config', 'apps/mcp/wrangler.jsonc', '--dry-run'],
  ]) {
    const result = spawnSync('pnpm', args, { cwd: dir, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, `Unreviewed content passed: ${args.join(' ')}`);
    assert.match(
      result.stdout + result.stderr,
      /Review is stale/,
      'Must fail at the editorial gate, not an unrelated environment error',
    );
    console.log(`Unreviewed edit blocked: ${args.join(' ')}`);
  }
  await writeFile(path, original);
  const manuscriptPath = join(dir, 'docs/content-review/school-lunch/DRAFT.md');
  const manuscript = await readFile(manuscriptPath, 'utf8');
  await writeFile(manuscriptPath, `${manuscript}\n未検証の政策提案。\n`);
  for (const args of [
    ['factcheck:check'],
    ['exec', 'astro', 'build', '--root', 'apps/web'],
    ['exec', 'wrangler', 'deploy', '--config', 'apps/mcp/wrangler.jsonc', '--dry-run'],
  ]) {
    const result = spawnSync('pnpm', args, { cwd: dir, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Review does not match current content/);
    console.log(`Unreviewed active policy edit blocked: ${args.join(' ')}`);
  }
  await writeFile(manuscriptPath, manuscript);
  for (const [file, mutate, expected] of [
    [
      'dynamics.json',
      (data: { observations: { frequency: string; period: string }[] }) => {
        data.observations = data.observations.filter(
          (o) => !(o.frequency === 'year' && o.period === '2025'),
        );
      },
      /Dynamics differs from original/,
    ],
    [
      'ages.json',
      (data: { records: { sourceRows: { age_total: number[] } }[] }) => {
        data.records[0].sourceRows.age_total = [999999];
      },
      /Published ages differ from original/,
    ],
  ] as const) {
    const publishedPath = join(dir, 'data/published', file);
    const originalData = await readFile(publishedPath, 'utf8');
    const tampered = JSON.parse(originalData);
    mutate(tampered);
    await writeFile(publishedPath, JSON.stringify(tampered));
    const blocked = spawnSync('pnpm', ['exec', 'astro', 'build', '--root', 'apps/web'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(blocked.error, undefined);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stdout + blocked.stderr, expected);
    await writeFile(publishedPath, originalData);
    console.log(`Numeric tampering blocked at direct Astro entry: ${file}`);
  }
  const archivedCode = join(dir, 'data/editorial/archive/scripts/factcheck.ts');
  await writeFile(archivedCode, `${await readFile(archivedCode, 'utf8')}\n// tampered\n`);
  const corruptArchive = spawnSync('pnpm', ['factcheck:check'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(corruptArchive.error, undefined);
  assert.notEqual(corruptArchive.status, 0);
  assert.match(corruptArchive.stdout + corruptArchive.stderr, /Archived verifier changed/);
  console.log('Tampered historical verifier blocked.');
  await cp(resolve('data/editorial/archive/scripts/factcheck.ts'), archivedCode);
  // Retired raw HTML is not redistributed. Its full audit remains a separate, explicit check.
  if (process.argv.includes('--originals')) {
    await cp(resolve('data/editorial/raw'), join(dir, 'data/editorial/raw'), { recursive: true });
    const sources = JSON.parse(await readFile(join(dir, 'data/editorial/evidence.json'), 'utf8'));
    const raw = join(dir, sources.find((s: { artifact: unknown }) => s.artifact).artifact.path);
    await writeFile(raw, `${await readFile(raw, 'utf8')}\n<!-- tampered -->`);
    const corrupt = spawnSync('pnpm', ['factcheck:archive-originals'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 60_000,
    });
    assert.equal(corrupt.error, undefined);
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stdout + corrupt.stderr, /Evidence differs from the immutable original/);
    console.log('Tampered original evidence blocked.');
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
