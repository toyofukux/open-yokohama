import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hash } from '../packages/warehouse/model.ts';
import { atomic, pointer } from '../packages/warehouse/storage.ts';

const startedAt = new Date().toISOString();
const baseRelease = await pointer('.');
const results: {
  series: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  report: unknown;
  failure: unknown;
  sources: unknown;
}[] = [];
async function optionalJson(path: string) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
    throw e;
  }
}
for (const [series, script] of [
  ['population', 'ingest.ts'],
  ['dynamics', 'ingest-dynamics.ts'],
  ['ages', 'ingest-ages.ts'],
  ['history', 'ingest-history.ts'],
]) {
  const at = new Date().toISOString();
  const prefix = series === 'population' ? '' : `${series}-`;
  const reportPath = `artifacts/${prefix}ingestion-report.json`,
    failurePath = `artifacts/${prefix}ingestion-failure.json`;
  await rm(reportPath, { force: true });
  await rm(failurePath, { force: true });
  const exitCode = await new Promise<number>((done) => {
    const child = spawn('pnpm', ['exec', 'tsx', `scripts/${script}`], { stdio: 'inherit' });
    child.on('error', () => done(1));
    child.on('close', (code) => done(code ?? 1));
  });
  const candidate = await optionalJson(`data/candidates/${series}.json`);
  results.push({
    series,
    exitCode,
    startedAt: at,
    finishedAt: new Date().toISOString(),
    report: await optionalJson(reportPath),
    failure: await optionalJson(failurePath),
    sources:
      candidate?.snapshots ??
      (series === 'population' && exitCode !== 0
        ? await optionalJson('artifacts/last-downloaded-source.json')
        : []),
  });
}
const run = { baseRelease, startedAt, finishedAt: new Date().toISOString(), results };
await mkdir('data/warehouse/runs', { recursive: true });
await writeFile(`data/warehouse/runs/${hash(run)}.json`, JSON.stringify(run), { flag: 'wx' });
await atomic('.', 'artifacts/refresh-run.json', run);
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1;
