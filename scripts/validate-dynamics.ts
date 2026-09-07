import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateDynamics } from '../packages/core/dynamics.ts';
import { parseDynamics } from '../packages/ingestion/dynamics.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';

const data = validateDynamics(JSON.parse(await readFile('data/published/dynamics.json', 'utf8')));
const notes = JSON.parse(await readFile('data/references/dynamics-notes.json', 'utf8'));
if (
  !/^[a-f0-9]{64}$/.test(notes.sha256) ||
  notes.path !== `data/raw/${notes.sha256}.xlsx` ||
  createHash('sha256')
    .update(await readFile(notes.path))
    .digest('hex') !== notes.sha256
)
  throw new Error('Dynamics definition notes integrity failure');
for (const snapshot of data.snapshots) {
  const bytes = await readFile(snapshot.path);
  if (createHash('sha256').update(bytes).digest('hex') !== snapshot.id)
    throw new Error('Dynamics snapshot integrity failure');
  const expected = data.observations.filter((o) => o.sourceId === snapshot.id);
  const actual = parseDynamics(
    decodeCsv(bytes),
    snapshot.scope,
    snapshot.id,
    expected[0]?.revision,
  );
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error(`Dynamics differs from original: ${snapshot.id}`);
}
console.log(
  `Verified ${data.observations.length} dynamics observations against 3 original CSV snapshots.`,
);
