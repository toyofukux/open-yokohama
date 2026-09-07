import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  assertRelease,
  canonical,
  digest,
  packet,
  textHash,
} from '../packages/factcheck/engine.ts';
import type { Assessment, Envelope, Report } from '../packages/factcheck/schema.ts';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const trust = [
  { id: 'reviewer', role: 'machine', publicKey: publicKey.export({ type: 'spki', format: 'pem' }) },
];
const now = new Date('2026-09-06T00:00:00Z');
function fixture() {
  const issue = {
    slug: 'population',
    category: '人口',
    title: '人口は？',
    summary: '人口を確認します。',
    metric: 'population',
    question: '人口は？',
    limits: '人数の合計です。',
    next: '年齢別は未収録です。',
  };
  const source = {
    id: 's1',
    title: '統計定義',
    url: 'https://www.city.yokohama.lg.jp/data',
    publisher: '横浜市',
    tier: 'primary',
    artifact: null,
    scopes: ['methodology'],
    retrievedAt: '2026-09-05T00:00:00Z',
    text: '人数の合計です。',
    contentHash: textHash('人数の合計です。'),
  };
  const input = packet([issue], [source], {
    version: 'v1',
    author: 'writer',
    maxReviewAgeDays: 30,
    manual: '確認基準。'.repeat(30),
  });
  const claims = input.blocks.map((b, i) => ({
    id: `c${i}`,
    blockId: b.id,
    quote: b.text,
    proposition: b.text,
    kind: 'fact' as const,
    requiresHuman: false,
    scope: 'methodology' as const,
  }));
  const review: Assessment = {
    coverageComplete: true,
    coverageRationale: 'Fixture only',
    missingClaims: [],
    judgments: claims.map((c) => ({
      claimId: c.id,
      kind: c.kind,
      requiresHuman: c.requiresHuman,
      verdict: 'supported',
      evidence: [{ sourceId: 's1', quote: source.text, relation: 'supports' }],
      rationale: 'Fixture only; not a semantic evaluation',
    })),
  };
  const report: Report = {
    schemaVersion: 1,
    packetHash: digest(input),
    reviewer: 'reviewer',
    reviewerRole: 'machine',
    reviewedAt: now.toISOString(),
    provider: 'unit-test-only',
    runs: [],
    extraction: { claims },
    verification: review,
    challenge: structuredClone(review),
  };
  return { input, report };
}
function signed(report: Report): Envelope {
  report.runs = [report.extraction, report.verification, report.challenge].map((o, i) => ({
    stage: (['extract', 'verify', 'challenge'] as const)[i],
    runId: `run${i}`,
    outputHash: digest(o),
  }));
  return {
    report,
    signature: sign(null, Buffer.from(canonical(report)), privateKey).toString('base64'),
  };
}
test('signed records pass structural gate; signatures do not prove semantic truth', () => {
  const { input, report } = fixture();
  assert.equal(assertRelease(input, signed(report), trust, now).method, 'ai_evidence_review');
});
test('edited content, evidence and domain manual invalidate earlier review', () => {
  for (const change of ['content', 'evidence', 'manual']) {
    const { input, report } = fixture();
    const envelope = signed(report);
    if (change === 'content') input.issues[0].summary = '別の主張';
    if (change === 'evidence') input.sources[0].text = '新しい原本';
    if (change === 'manual') input.policy.manual += '改定';
    assert.throws(() => assertRelease(input, envelope, trust, now), /stale/);
  }
});
test('untrusted signer, forged signature, future date and expired review fail closed', () => {
  const { input, report } = fixture();
  const envelope = signed(report);
  assert.throws(() => assertRelease(input, envelope, [], now), /Untrusted/);
  assert.throws(
    () => assertRelease(input, { ...envelope, signature: 'AA==' }, trust, now),
    /signature/,
  );
  assert.throws(() => assertRelease(input, envelope, trust, new Date('2026-09-05')), /future/);
  assert.throws(() => assertRelease(input, envelope, trust, new Date('2026-11-06')), /expired/);
});
test('omitted visible text and semantic coverage rejection both stop publication', () => {
  for (const mode of ['quote', 'missing', 'challenge']) {
    const { input, report } = fixture();
    if (mode === 'quote') report.extraction.claims[0].quote = '';
    if (mode === 'missing') report.verification.missingClaims = ['A missing assertion'];
    if (mode === 'challenge') report.challenge.coverageComplete = false;
    assert.throws(() => assertRelease(input, signed(report), trust, now));
  }
});
test('unknown citations, invented quotes, insufficient evidence and counterevidence are rejected', () => {
  for (const mode of ['unknown', 'quote', 'not_found', 'refuted', 'counter', 'tier', 'scope']) {
    const { input, report } = fixture();
    const j = report.challenge.judgments[0];
    if (mode === 'unknown') j.evidence[0].sourceId = 'invented';
    if (mode === 'quote') j.evidence[0].quote = '存在しない引用';
    if (mode === 'not_found') j.verdict = 'insufficient';
    if (mode === 'refuted') j.verdict = 'refuted';
    if (mode === 'counter') j.evidence.push({ ...j.evidence[0], relation: 'refutes' });
    if (mode === 'tier') input.sources[0].tier = 'official_statement';
    if (mode === 'scope') input.sources[0].scopes = ['product'];
    report.packetHash = digest(input);
    assert.throws(() => assertRelease(input, signed(report), trust, now), /blocked/);
  }
});
test('a verification failure is not overruled by a successful challenge', () => {
  const { input, report } = fixture();
  report.verification.judgments[0].verdict = 'insufficient';
  assert.throws(() => assertRelease(input, signed(report), trust, now), /blocked/);
});
test('classification disagreement and missing/duplicate judgments fail closed', () => {
  for (const mode of ['kind', 'missing', 'duplicate']) {
    const { input, report } = fixture();
    if (mode === 'kind') report.challenge.judgments[0].kind = 'non_assertion';
    if (mode === 'missing') report.challenge.judgments.pop();
    if (mode === 'duplicate') report.challenge.judgments[1] = report.challenge.judgments[0];
    assert.throws(() => assertRelease(input, signed(report), trust, now));
  }
});
test('machine identity cannot approve interpretations even with two positive judgments', () => {
  const { input, report } = fixture();
  report.extraction.claims[0].kind = 'interpretation';
  report.verification.judgments[0].kind = 'interpretation';
  report.challenge.judgments[0].kind = 'interpretation';
  assert.throws(() => assertRelease(input, signed(report), trust, now), /Human approval/);
});
test('invalid source hashes and duplicate IDs cannot enter the packet', () => {
  const { input } = fixture();
  assert.throws(
    () => packet(input.issues, [{ ...input.sources[0], text: 'tampered' }], input.policy),
    /hash/,
  );
  assert.throws(
    () => packet([...input.issues, ...input.issues], input.sources, input.policy),
    /Duplicate/,
  );
});
test('a machine signature cannot be promoted to human by changing the trust registry', () => {
  const { input, report } = fixture();
  assert.throws(
    () => assertRelease(input, signed(report), [{ ...trust[0], role: 'human' }], now),
    /Untrusted/,
  );
});
test('high-risk factual claims and disagreement about human review block machines', () => {
  for (const mode of ['all', 'challenge']) {
    const { input, report } = fixture();
    report.challenge.judgments[0].requiresHuman = true;
    if (mode === 'all') {
      report.extraction.claims[0].requiresHuman = true;
      report.verification.judgments[0].requiresHuman = true;
    }
    assert.throws(() => assertRelease(input, signed(report), trust, now), /Human|classification/);
  }
});
test('non-assertions cannot smuggle contradictory evidence through the gate', () => {
  const { input, report } = fixture();
  report.extraction.claims[0].kind = 'non_assertion';
  for (const review of [report.verification, report.challenge]) {
    review.judgments[0].kind = 'non_assertion';
    review.judgments[0].verdict = 'not_applicable';
    review.judgments[0].evidence[0].relation = 'refutes';
  }
  assert.throws(() => assertRelease(input, signed(report), trust, now), /Non-assertion/);
});
test('verifier implementation changes invalidate signed reviews', () => {
  const { input, report } = fixture();
  const envelope = signed(report);
  input.implementation['verifier.ts'] = 'changed';
  assert.throws(() => assertRelease(input, envelope, trust, now), /stale/);
});
test('fresh review cannot make stale source retrieval current', () => {
  const { input, report } = fixture();
  input.sources[0].retrievedAt = '2026-07-01T00:00:00Z';
  report.packetHash = digest(input);
  assert.throws(() => assertRelease(input, signed(report), trust, now), /retrieval expired/);
});
