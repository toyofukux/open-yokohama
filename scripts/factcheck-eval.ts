import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { digest } from '../packages/factcheck/engine.ts';
import { assessmentSchema, type Claim } from '../packages/factcheck/schema.ts';
import { loadPacket } from './factcheck.ts';
import { runStage } from './factcheck-provider.ts';

// A small, explicit regression set, not a general accuracy benchmark.
const cases = [
  { text: '2026年8月1日の横浜市の人口は3,757,891人です。', expected: 'supported' },
  { text: '2026年8月1日の横浜市の人口は37,578,910人です。', expected: 'refuted' },
  { text: '2026年8月の横浜市の人口は、令和7年国勢調査確定値が基礎です。', expected: 'refuted' },
  { text: '横浜市の人口増加は、新しい住宅政策だけが原因です。', expected: 'insufficient' },
  { text: '横浜市は2026年度に住宅支援へ1兆円を支出しました。', expected: 'insufficient' },
  { text: '横浜市の人口は、どのように推移している？', expected: 'not_applicable' },
] as const;
const claims: Claim[] = cases.map((c, i) => ({
  id: `eval-${i}`,
  blockId: `eval.${i}`,
  quote: c.text,
  proposition: c.text,
  kind: i === 5 ? 'non_assertion' : 'fact',
  scope: 'statistics',
  requiresHuman: i === 3 || i === 4,
}));
const base = await loadPacket();
// Explicitly omit two entire factual blocks. A compound claim's implicit premises
// may be checked within that claim, so their separate listing is not a stable coverage oracle.
const unreviewedBlocks = [
  { id: 'eval.missing-households', text: '2026年8月1日の横浜市の世帯数は1,811,911世帯です。' },
  { id: 'eval.missing-basis', text: 'この推計人口は住民基本台帳の登録者数と一致します。' },
];
const input = {
  ...base,
  blocks: [...claims.map((c) => ({ id: c.blockId, text: c.quote })), ...unreviewedBlocks],
};
const output = assessmentSchema.parse(await runStage('challenge', input, claims));
const results = cases.map((c, i) => ({
  ...c,
  actual: output.judgments.find((j) => j.claimId === claims[i].id)?.verdict,
}));
await mkdir('artifacts/factcheck', { recursive: true });
await writeFile(
  'artifacts/factcheck/evaluation.json',
  JSON.stringify(
    {
      evaluatedAt: new Date().toISOString(),
      inputHash: digest(input),
      provider: 'codex-cli default model',
      results,
      unreviewedBlocks,
      output,
    },
    null,
    2,
  ),
);
for (const r of results) assert.equal(r.actual, r.expected, r.text);
// Both omitted blocks must be detected in addition to the six supplied verdicts.
assert.equal(output.coverageComplete, false);
assert.ok(output.missingClaims.length >= 2);
assert.equal(output.judgments.length, cases.length);
console.log(
  `Real-provider regression passed ${results.length}/${cases.length}; limited examples, not general accuracy.`,
);
