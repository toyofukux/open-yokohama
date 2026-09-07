import evidence from '../../data/editorial/evidence.json';
import implementation from '../../data/editorial/implementation.json';
import candidates from '../../data/editorial/issues.json';
import policy from '../../data/editorial/policy.json';
import review from '../../data/editorial/review.json';
import trust from '../../data/editorial/reviewers.json';
import published from '../../data/published/editorial.json';
import { assertRelease, canonical, packet } from '../factcheck/engine.ts';
import { heldPage, records } from './corrections';

// Publication freshness is checked by checkRelease at build time. Runtime verifies
// the historical signed release without making Worker startup depend on the wall clock.
const verified = assertRelease(
  packet(candidates, evidence, policy, implementation),
  review,
  trust,
  new Date(review.report.reviewedAt),
);
const expected = { ...verified, sources: evidence.map(({ text: _text, ...source }) => source) };
if (canonical(published) !== canonical(expected)) throw new Error('Unverified editorial release');
export const allIssues = verified.issues;
for (const record of records) {
  if (!allIssues.some((issue) => record.page === `/issues/${issue.slug}/`))
    throw new Error('Correction targets an unknown article');
}
export const issues = allIssues.filter((issue) => !heldPage(`/issues/${issue.slug}/`));
export const editorialVerification = {
  method: verified.method,
  reviewedAt: verified.reviewedAt,
  packetHash: verified.packetHash,
  humanReviewed: verified.method === 'human_review',
};
export function issueEvidence(slug: string) {
  return review.report.extraction.claims
    .filter((c) => c.blockId.startsWith(`${slug}.`))
    .map((claim) => ({
      ...claim,
      verification: review.report.verification.judgments.find((j) => j.claimId === claim.id),
      challenge: review.report.challenge.judgments.find((j) => j.claimId === claim.id),
    }));
}
export const editorialSources = expected.sources.map((source) => ({
  ...source,
  title: source.url.endsWith('.csv') ? `${source.title}（CSVダウンロード）` : source.title,
}));
