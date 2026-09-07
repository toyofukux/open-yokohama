import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(resolve(tmpdir(), 'open-yokohama-dynamics-'));
const data = JSON.parse(await readFile(resolve(root, 'data/published/dynamics.json'), 'utf8'));
const run = () =>
  execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'scripts/validate-dynamics.ts')],
    { cwd: temporary, stdio: 'pipe' },
  );
try {
  await mkdir(resolve(temporary, 'data/published'), { recursive: true });
  await mkdir(resolve(temporary, 'data/raw'), { recursive: true });
  await mkdir(resolve(temporary, 'data/references'), { recursive: true });
  const notesBytes = await readFile(resolve(root, 'data/references/dynamics-notes.json'));
  const notes = JSON.parse(notesBytes.toString());
  await writeFile(resolve(temporary, 'data/references/dynamics-notes.json'), notesBytes);
  await writeFile(resolve(temporary, notes.path), await readFile(resolve(root, notes.path)));
  for (const source of data.snapshots)
    await writeFile(resolve(temporary, source.path), await readFile(resolve(root, source.path)));
  const published = resolve(temporary, 'data/published/dynamics.json');
  await writeFile(published, JSON.stringify(data));
  run();
  const removed = structuredClone(data);
  removed.observations = removed.observations.filter(
    (o: { frequency: string; period: string }) => !(o.frequency === 'year' && o.period === '2025'),
  );
  await writeFile(published, JSON.stringify(removed));
  assert.throws(
    run,
    /Command failed/,
    'Removing an entire trailing year must fail original reparse',
  );
  await writeFile(published, JSON.stringify(data));
  const source = data.snapshots[0];
  await writeFile(
    resolve(temporary, source.path),
    Buffer.concat([await readFile(resolve(root, source.path)), Buffer.from('\n')]),
  );
  assert.throws(run, /Command failed/, 'Any raw-byte change must fail snapshot hash');
  console.log(
    'Dynamics publication gate: clean original passes; removed trailing year and raw-byte tampering fail. Published workspace unchanged.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
