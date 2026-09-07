import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(resolve(tmpdir(), 'open-yokohama-ages-'));
const data = JSON.parse(await readFile(resolve(root, 'data/published/ages.json'), 'utf8'));
const run = () =>
  execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'scripts/validate-ages.ts')],
    { cwd: temporary, stdio: 'pipe' },
  );
try {
  await mkdir(resolve(temporary, 'data/published'), { recursive: true });
  await mkdir(resolve(temporary, 'data/raw'), { recursive: true });
  const source = data.snapshots[0];
  const bytes = await readFile(resolve(root, source.path));
  await writeFile(resolve(temporary, source.path), bytes);
  const published = resolve(temporary, 'data/published/ages.json');
  await writeFile(published, JSON.stringify(data));
  run();
  const removed = structuredClone(data);
  removed.records = removed.records.filter((r: { period: string }) => r.period !== '2025-01-01');
  await writeFile(published, JSON.stringify(removed));
  assert.throws(run, /Command failed/);
  const rows = structuredClone(data);
  rows.records[0].sourceRows.age_total = [999999];
  await writeFile(published, JSON.stringify(rows));
  assert.throws(run, /Command failed/);
  await writeFile(published, JSON.stringify(data));
  await writeFile(resolve(temporary, source.path), Buffer.concat([bytes, Buffer.from('\n')]));
  assert.throws(run, /Command failed/);
  console.log(
    'Age publication gate: clean original passes; omitted year, forged source row and raw-byte change fail. Published workspace unchanged.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
