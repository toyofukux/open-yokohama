import assert from 'node:assert/strict';
import test from 'node:test';
import { correctionSchema, reportUrl } from '../packages/core/corrections.ts';

const record = {
  id: 'correction-1',
  page: '/issues/population/',
  issueUrl: 'https://github.com/toyofukux/open-yokohama/issues/1',
  status: 'investigating',
  hold: true,
  reason: '定義を確認中',
  updatedAt: '2026-09-06T00:00:00Z',
  resolution: '',
  revision: '',
};
test('resolved corrections require an explanation, release of hold, and fixing commit', () => {
  assert.ok(correctionSchema.safeParse(record).success);
  assert.ok(!correctionSchema.safeParse({ ...record, status: 'corrected' }).success);
  assert.ok(!correctionSchema.safeParse({ ...record, status: 'closed', hold: false }).success);
  assert.ok(
    correctionSchema.safeParse({
      ...record,
      status: 'corrected',
      hold: false,
      resolution: '原典の注記に合わせて訂正',
      revision: 'a'.repeat(40),
    }).success,
  );
  assert.ok(!correctionSchema.safeParse({ ...record, issueUrl: 'javascript:alert(1)' }).success);
});
test('report links preserve unicode, delimiters and the original version', () => {
  const link = new URL(
    reportUrl('/issues/population/', 'abc123', '人口 & <注記> #1'),
    'https://open.yokohama',
  );
  assert.equal(link.searchParams.get('target'), '人口 & <注記> #1');
  assert.equal(link.searchParams.get('version'), 'abc123');
});
