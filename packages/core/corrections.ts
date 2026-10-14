import { z } from 'zod';
import raw from '../../data/corrections/records.json' with { type: 'json' };

// One ledger entry per handled inquiry. The inquiry itself stays in D1 and is never published.
export const correctionSchema = z
  .object({
    id: z.string().regex(/^correction-[1-9][0-9]*$/),
    page: z.string().regex(/^\/issues\/[a-z0-9-]+\/$/),
    inquiryId: z.number().int().positive(),
    status: z.enum(['received', 'investigating', 'corrected', 'closed']),
    hold: z.boolean(),
    reason: z.string().min(1),
    updatedAt: z.iso.datetime(),
    resolution: z.string(),
    revision: z.string(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.id !== `correction-${record.inquiryId}`)
      ctx.addIssue({ code: 'custom', message: 'Correction ID must carry its inquiry number' });
    if (['corrected', 'closed'].includes(record.status) && (!record.resolution || record.hold))
      ctx.addIssue({ code: 'custom', message: 'Resolved reports need a reason and no hold' });
    if (record.status === 'corrected' && !/^[a-f0-9]{40}$/.test(record.revision))
      ctx.addIssue({ code: 'custom', message: 'Corrections require the full fixing commit' });
  });
export const records = correctionSchema.array().parse(raw);
if (new Set(records.map((r) => r.id)).size !== records.length)
  throw new Error('Duplicate correction ID');
export const statusLabels = {
  received: '受付',
  investigating: '確認中',
  corrected: '訂正済み',
  closed: '対応終了',
};
export function heldPage(page: string) {
  return records.find((r) => r.page === page && r.hold);
}
export function reportUrl(page: string, version = '', target = '') {
  const params = new URLSearchParams();
  for (const [key, value] of [
    ['page', page],
    ['version', version],
    ['target', target],
  ])
    if (value) params.set(key, value);
  const query = params.toString();
  return `/corrections/report/${query ? `?${query}` : ''}`;
}
