import { z } from 'zod';
import raw from '../../data/corrections/records.json' with { type: 'json' };

export const correctionSchema = z
  .object({
    id: z.string().regex(/^correction-[1-9][0-9]*$/),
    page: z.string().regex(/^\/issues\/[a-z0-9-]+\/$/),
    issueUrl: z
      .string()
      .regex(/^https:\/\/github\.com\/toyofukux\/open-yokohama\/issues\/[1-9][0-9]*$/),
    status: z.enum(['received', 'investigating', 'corrected', 'closed']),
    hold: z.boolean(),
    reason: z.string().min(1),
    updatedAt: z.iso.datetime(),
    resolution: z.string(),
    revision: z.string(),
  })
  .strict()
  .superRefine((record, ctx) => {
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
export function reportUrl(page: string, version: string, target = '') {
  return `/corrections/report/?${new URLSearchParams({ page, version, target })}`;
}
