import { z } from 'zod';

const id = z.string().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const issueSchema = z
  .object({
    slug: id,
    category: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    metric: z.enum(['population', 'households', 'density']),
    question: z.string().min(1),
    limits: z.string().min(1),
    next: z.string().min(1),
  })
  .strict();
export const issueListSchema = z.array(issueSchema).min(1).max(100);
export const sourceSchema = z
  .object({
    id,
    title: z.string().min(1),
    url: z.url(),
    publisher: z.string().min(1),
    tier: z.enum(['primary', 'official_statement', 'secondary', 'internal']),
    scopes: z
      .array(z.enum(['statistics', 'methodology', 'product']))
      .min(1)
      .max(3),
    retrievedAt: z.iso.datetime(),
    contentHash: hash,
    artifact: z
      .object({
        path: z
          .string()
          .regex(/^data\/(?:editorial\/raw\/[a-f0-9]{64}\.html|raw\/[a-f0-9]{64}\.csv)$/),
        sha256: hash,
      })
      .strict()
      .nullable(),
    text: z.string().min(1).max(100_000),
  })
  .strict();
export const policySchema = z
  .object({
    version: id,
    author: id,
    maxReviewAgeDays: z.number().int().min(1).max(365),
    manual: z.string().min(100).max(20_000),
  })
  .strict();
export const kindSchema = z.enum(['fact', 'interpretation', 'proposal', 'non_assertion']);
export const claimSchema = z
  .object({
    id,
    blockId: id,
    quote: z.string().min(1),
    proposition: z.string().min(1),
    kind: kindSchema,
    requiresHuman: z.boolean(),
    scope: z.enum(['statistics', 'methodology', 'product']),
  })
  .strict();
export const extractionSchema = z.object({ claims: z.array(claimSchema).min(1).max(500) }).strict();
export const evidenceSchema = z
  .object({
    sourceId: id,
    quote: z.string().min(1).max(3000),
    relation: z.enum(['supports', 'refutes', 'context']),
  })
  .strict();
export const judgmentSchema = z
  .object({
    claimId: id,
    kind: kindSchema,
    requiresHuman: z.boolean(),
    verdict: z.enum(['supported', 'refuted', 'insufficient', 'not_applicable']),
    evidence: z.array(evidenceSchema).max(20),
    rationale: z.string().min(1),
  })
  .strict();
export const assessmentSchema = z
  .object({
    coverageComplete: z.boolean(),
    coverageRationale: z.string().min(1),
    missingClaims: z.array(z.string().min(1)),
    judgments: z.array(judgmentSchema).min(1).max(500),
  })
  .strict();
export const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    packetHash: hash,
    reviewer: id,
    reviewerRole: z.enum(['machine', 'human']),
    reviewedAt: z.iso.datetime(),
    provider: z.string().min(1),
    runs: z
      .array(
        z
          .object({
            stage: z.enum(['extract', 'verify', 'challenge']),
            runId: id,
            outputHash: hash,
          })
          .strict(),
      )
      .length(3),
    extraction: extractionSchema,
    verification: assessmentSchema,
    challenge: assessmentSchema,
  })
  .strict();
export const envelopeSchema = z
  .object({
    report: reportSchema,
    signature: z.string().min(1),
  })
  .strict();
export const trustSchema = z.array(
  z
    .object({
      id,
      role: z.enum(['machine', 'human']),
      publicKey: z.string().min(1),
    })
    .strict(),
);
export type Issue = z.infer<typeof issueSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Policy = z.infer<typeof policySchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Report = z.infer<typeof reportSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
