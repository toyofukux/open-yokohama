import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonical } from '../factcheck/engine.ts';

export const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export const bytesHash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const datasetIds = [
  'population',
  'dynamics',
  'ages',
  'historical',
  'city-series',
  'ward-monthly',
] as const;
export const factSchema = z
  .object({
    key: z.string().min(1),
    version: hashSchema,
    dataset: z.enum(datasetIds),
    metric: z.string(),
    definitionVersion: hashSchema,
    geography: z.string(),
    geographyBasis: z.string(),
    period: z.string(),
    frequency: z.enum(['point', 'month', 'year']),
    value: z.number().finite(),
    unit: z.string(),
    basis: z.string(),
    provisional: z.boolean(),
    sourceId: hashSchema,
    rows: z.array(z.number().int().min(2)).min(1),
    column: z.string(),
    revision: z.number().int().positive(),
    status: z.literal('machine_verified'),
    legacyId: z.string().optional(),
  })
  .strict();
export type Fact = z.infer<typeof factSchema>;
export function identity(input: Omit<Fact, 'key' | 'version'>): Fact {
  const key = [
    input.dataset,
    input.metric,
    input.definitionVersion,
    input.geography,
    input.geographyBasis,
    input.frequency,
    input.period,
  ].join('|');
  return { ...input, key, version: hash({ key, ...input }) };
}
export const querySchema = z
  .object({
    dataset: z.enum(datasetIds),
    geography: z.string().regex(/^141\d{3}$/),
    metric: z.string().min(1).max(60),
    from: z
      .string()
      .regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/)
      .optional(),
    frequency: z.enum(['point', 'month', 'year']).optional(),
    limit: z.number().int().min(1).max(500).default(100),
    offset: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
export function queryFacts(facts: Fact[], raw: z.input<typeof querySchema>) {
  const q = querySchema.parse(raw);
  if (q.from && q.to && q.from > q.to) throw new Error('Invalid period range');
  const rows = facts
    .filter(
      (f) =>
        f.dataset === q.dataset &&
        f.geography === q.geography &&
        f.metric === q.metric &&
        (!q.frequency || f.frequency === q.frequency) &&
        (!q.from || f.period >= q.from) &&
        (!q.to || f.period <= q.to || f.period.startsWith(q.to)),
    )
    .sort((a, b) => a.period.localeCompare(b.period));
  return {
    observations: rows.slice(q.offset, q.offset + q.limit),
    total: rows.length,
    unavailable: rows.length === 0,
    nextOffset: q.offset + q.limit < rows.length ? q.offset + q.limit : null,
  };
}
export type Change = {
  key: string;
  kind: 'added' | 'removed' | 'value' | 'provenance';
  before: string | null;
  after: string | null;
};
export function diffFacts(before: Fact[], after: Fact[]): Change[] {
  const old = new Map(before.map((f) => [f.key, f]));
  const changes: Change[] = [];
  for (const f of after) {
    const prev = old.get(f.key);
    if (!prev) changes.push({ key: f.key, kind: 'added', before: null, after: f.version });
    else if (prev.version !== f.version)
      changes.push({
        key: f.key,
        kind: prev.value !== f.value ? 'value' : 'provenance',
        before: prev.version,
        after: f.version,
      });
    old.delete(f.key);
  }
  for (const f of old.values())
    changes.push({ key: f.key, kind: 'removed', before: f.version, after: null });
  return changes;
}
