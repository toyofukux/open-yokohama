import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'yokohama-corrections-'));
try {
  for (const path of ['package.json', 'packages', 'scripts', 'data', 'apps', 'docs'])
    await cp(resolve(path), join(dir, path), {
      recursive: true,
      filter: (p) =>
        !p.includes('/.wrangler') && !p.includes('/node_modules') && !p.includes('/dist'),
    });
  await symlink(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  const { allPolicyIssues } = await import('../packages/core/policy-issues.ts');
  const issue = allPolicyIssues[1];
  const record = {
    id: 'correction-1',
    page: `/issues/${issue.slug}/`,
    inquiryId: 1,
    status: 'investigating',
    hold: true,
    reason: 'TEST ONLY: definition under review',
    updatedAt: '2026-09-06T00:00:00Z',
    resolution: '',
    revision: '',
  };
  await writeFile(join(dir, 'data/corrections/records.json'), JSON.stringify([record]));
  const build = spawnSync('pnpm', ['exec', 'astro', 'build', '--root', 'apps/web'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const html = await readFile(join(dir, `apps/web/dist/issues/${issue.slug}/index.html`), 'utf8');
  assert.match(html, /この説明は確認中です/);
  assert.ok(!html.includes(issue.title), 'Held title leaked into HTML/metadata');
  assert.ok(!html.includes(issue.summary), 'Held summary leaked into HTML');
  const history = await readFile(join(dir, 'apps/web/dist/corrections/index.html'), 'utf8');
  assert.match(history, /確認中/);
  assert.match(history, /TEST ONLY: definition under review/);
  assert.match(history, /2026-09-06/);
  const inspect = spawnSync(
    'pnpm',
    [
      'exec',
      'tsx',
      '-e',
      "import {policyIssues} from './packages/core/policy-issues.ts'; console.log(JSON.stringify(policyIssues.map(i=>i.slug)))",
    ],
    { cwd: dir, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.ok(
    !JSON.parse(inspect.stdout).includes(issue.slug),
    'Held article remains in shared Web/MCP catalogue',
  );
  await writeFile(
    join(dir, 'data/corrections/records.json'),
    JSON.stringify([{ ...record, page: '/issues/does-not-exist/' }]),
  );
  const invalid = spawnSync(
    'pnpm',
    ['exec', 'tsx', '-e', "import './packages/core/policy-issues.ts'"],
    {
      cwd: dir,
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Correction targets an unknown article/);
  console.log(
    'Held article hidden from HTML/metadata and shared catalogue; history rendered; unknown target rejected. No public report sent.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
