import { createHash, createPublicKey, verify } from 'node:crypto';
import {
  type Assessment,
  type Claim,
  envelopeSchema,
  type Issue,
  issueListSchema,
  type Policy,
  policySchema,
  type Report,
  type Source,
  sourceSchema,
  trustSchema,
} from './schema.ts';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
      .join(',')}}`;
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('Non-JSON value');
  return result;
}
export const digest = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export const textHash = (value: string) => createHash('sha256').update(value).digest('hex');
const fields = ['category', 'title', 'summary', 'question', 'limits', 'next'] as const;
export function blocks(issues: Issue[]) {
  return issues.flatMap((issue) =>
    fields.map((field) => ({
      id: `${issue.slug}.${field}`,
      text: issue[field],
    })),
  );
}
function unique(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label}`);
}
export function packet(
  issuesInput: unknown,
  sourcesInput: unknown,
  policyInput: unknown,
  implementation: Record<string, string> = {},
) {
  const issues = issueListSchema.parse(issuesInput);
  const sources = sourceSchema.array().min(1).parse(sourcesInput);
  const policy = policySchema.parse(policyInput);
  unique(
    issues.map((i) => i.slug),
    'article',
  );
  unique(
    sources.map((s) => s.id),
    'source',
  );
  for (const source of sources) {
    if (textHash(source.text) !== source.contentHash)
      throw new Error(`Source hash mismatch: ${source.id}`);
    if (new URL(source.url).protocol !== 'https:') throw new Error('Sources must use HTTPS');
  }
  return { issues, blocks: blocks(issues), sources, policy, implementation };
}
export type Packet = ReturnType<typeof packet>;

export function assertCoverage(input: Packet, claims: Claim[]) {
  unique(
    claims.map((c) => c.id),
    'claim',
  );
  const validBlocks = new Set(input.blocks.map((b) => b.id));
  for (const claim of claims) {
    if (!validBlocks.has(claim.blockId)) throw new Error('Unknown article block');
  }
  // Every character of every visible editorial field belongs to a reviewed claim.
  // Semantic completeness is independently checked in both later passes.
  for (const block of input.blocks) {
    const covered = claims
      .filter((c) => c.blockId === block.id)
      .map((c) => c.quote)
      .join('');
    if (covered !== block.text) throw new Error(`Incomplete or overlapping coverage: ${block.id}`);
  }
}

export function inspectAssessment(input: Packet, claims: Claim[], review: Assessment): string[] {
  const errors: string[] = [];
  if (!review.coverageComplete || review.missingClaims.length)
    errors.push('Unreviewed claims remain');
  unique(
    review.judgments.map((j) => j.claimId),
    'judgment',
  );
  const claimIds = new Set(claims.map((c) => c.id));
  if (
    review.judgments.length !== claims.length ||
    review.judgments.some((j) => !claimIds.has(j.claimId))
  )
    errors.push('Judgment coverage mismatch');
  for (const claim of claims) {
    const judgment = review.judgments.find((j) => j.claimId === claim.id);
    if (!judgment) {
      errors.push(`Missing judgment: ${claim.id}`);
      continue;
    }
    if (judgment.kind !== claim.kind) errors.push(`Claim classification disagreement: ${claim.id}`);
    for (const e of judgment.evidence) {
      const source = input.sources.find((s) => s.id === e.sourceId);
      if (!source?.text.includes(e.quote)) errors.push(`Untraceable quote: ${claim.id}`);
    }
    if (judgment.requiresHuman !== claim.requiresHuman)
      errors.push(`Human-review classification disagreement: ${claim.id}`);
    if (claim.kind === 'non_assertion') {
      if (judgment.evidence.length) errors.push(`Non-assertion contains evidence: ${claim.id}`);
      if (judgment.verdict !== 'not_applicable') errors.push(`Invalid non-assertion: ${claim.id}`);
      continue;
    }
    if (judgment.verdict !== 'supported') errors.push(`${judgment.verdict}: ${claim.id}`);
    if (judgment.evidence.some((e) => e.relation === 'refutes'))
      errors.push(`Counterevidence: ${claim.id}`);
    const supporting = judgment.evidence.filter((e) => e.relation === 'supports');
    if (!supporting.length) errors.push(`Missing supporting evidence: ${claim.id}`);
    if (
      !supporting.some((e) => {
        const s = input.sources.find((source) => source.id === e.sourceId);
        if (!s?.scopes.includes(claim.scope)) return false;
        if (claim.scope === 'product') return s.tier === 'internal';
        return s.tier === 'primary';
      })
    )
      errors.push(`Insufficient source tier or scope: ${claim.id}`);
  }
  return errors;
}

export function assess(input: Packet, report: Report) {
  if (report.packetHash !== digest(input))
    throw new Error('Review is stale: content, evidence or policy changed');
  assertCoverage(input, report.extraction.claims);
  const errors = [
    ...inspectAssessment(input, report.extraction.claims, report.verification),
    ...inspectAssessment(input, report.extraction.claims, report.challenge),
  ];
  return { errors: [...new Set(errors)], claims: report.extraction.claims };
}

export function assertRelease(
  input: Packet,
  envelopeInput: unknown,
  trustInput: unknown,
  now = new Date(),
) {
  const envelope = envelopeSchema.parse(envelopeInput);
  const trust = trustSchema.parse(trustInput);
  unique(
    trust.map((t) => t.id),
    'trusted reviewer',
  );
  const report = envelope.report;
  const reviewer = trust.find((t) => t.id === report.reviewer);
  if (!reviewer || reviewer.role !== report.reviewerRole || reviewer.id === input.policy.author)
    throw new Error('Untrusted or non-independent reviewer');
  const key = createPublicKey(reviewer.publicKey);
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    !verify(null, Buffer.from(canonical(report)), key, Buffer.from(envelope.signature, 'base64'))
  )
    throw new Error('Invalid review signature');
  const reviewedAt = Date.parse(report.reviewedAt);
  const age = now.getTime() - reviewedAt;
  if (age < 0 || age > input.policy.maxReviewAgeDays * 86400000)
    throw new Error('Review expired or future-dated');
  for (const source of input.sources) {
    const retrieved = Date.parse(source.retrievedAt);
    if (retrieved > reviewedAt) throw new Error('Evidence postdates review');
    if (reviewedAt - retrieved > input.policy.maxReviewAgeDays * 86400000)
      throw new Error('Evidence retrieval expired; refresh the original first');
  }
  unique(
    report.runs.map((r) => r.runId),
    'verification run',
  );
  const outputs = [report.extraction, report.verification, report.challenge];
  for (const [index, stage] of ['extract', 'verify', 'challenge'].entries()) {
    if (
      report.runs[index].stage !== stage ||
      report.runs[index].outputHash !== digest(outputs[index])
    )
      throw new Error('Verification receipt mismatch');
  }
  const result = assess(input, report);
  if (result.errors.length) throw new Error(`Publication blocked: ${result.errors.join('; ')}`);
  if (
    result.claims.some(
      (c) => c.requiresHuman || c.kind === 'interpretation' || c.kind === 'proposal',
    ) &&
    reviewer.role !== 'human'
  )
    throw new Error('Human approval required for interpretations and proposals');
  return {
    issues: input.issues,
    claims: result.claims,
    reviewedAt: report.reviewedAt,
    reviewer: report.reviewer,
    method: reviewer.role === 'machine' ? 'ai_evidence_review' : 'human_review',
    packetHash: report.packetHash,
    sourceCount: input.sources.length,
  };
}

export function makePacket(issues: Issue[], sources: Source[], policy: Policy) {
  return packet(issues, sources, policy);
}
