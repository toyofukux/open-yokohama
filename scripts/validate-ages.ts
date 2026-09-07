import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { validateAges } from '../packages/core/ages.ts';
import { parseAges } from '../packages/ingestion/ages.ts';
import { decodeCsv } from '../packages/ingestion/population.ts';

const data = validateAges(JSON.parse(await readFile('data/published/ages.json', 'utf8')));
const source = data.snapshots[0],
  bytes = await readFile(source.path);
if (createHash('sha256').update(bytes).digest('hex') !== source.id)
  throw new Error('Age snapshot integrity failure');
if (
  !isDeepStrictEqual(parseAges(decodeCsv(bytes), source.id, data.records[0].revision), data.records)
)
  throw new Error('Published ages differ from original');
console.log(
  `Verified ${data.records.length} age records (5 metrics each) against original CSV, including sex and ward totals.`,
);
