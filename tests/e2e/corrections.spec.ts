import { expect, test } from '@playwright/test';
import { allPolicyIssues } from '../../packages/core/policy-issues.ts';

test('a policy article report carries its context and stops before public submission', async ({
  page,
}) => {
  await page.goto(allPolicyIssues[0].url);
  await page.getByRole('link', { name: 'このページの誤りを知らせる' }).click();
  await expect(page.getByLabel('対象ページのURL')).toHaveValue(
    `https://open.yokohama${allPolicyIssues[0].url}`,
  );
  await expect(page.getByLabel('対象箇所・表示していた版')).toHaveValue(
    /表示版：記事 SHA-256:[a-f0-9]{64}/,
  );
  await expect(page.getByText('ここではまだ送信されません。', { exact: false })).toBeVisible();
  await page.getByLabel('気になる点・誤りの内容（必須）').fill('統計の時点を確認したい');
  let requested = '';
  await page.route('https://github.com/**', async (route) => {
    requested = route.request().url();
    await route.fulfill({ status: 200, body: 'External submission intercepted by test' });
  });
  await page.getByRole('button', { name: 'GitHubで内容を確認する →' }).click();
  await expect.poll(() => requested).toContain('issues/new');
  const url = new URL(requested);
  expect(url.searchParams.get('context')).toMatch(/表示版：記事 SHA-256:[a-f0-9]{64}/);
  expect(url.searchParams.get('problem')).toBe('統計の時点を確認したい');
  expect(url.searchParams.get('evidence')).toBe('');
});

test('untrusted report context is plain text and cannot redirect the target page', async ({
  page,
}) => {
  await page.goto('/corrections/report/?page=//evil.example/&target=%3Cimg%20src=x%3E&version=old');
  await expect(page.getByLabel('対象ページのURL')).toHaveValue('');
  await expect(page.getByLabel('対象箇所・表示していた版')).toHaveValue(
    '対象：<img src=x>\n表示版：old',
  );
  await expect(page.locator('article img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('comparison report preserves selected metric, period and both data versions', async ({
  page,
}) => {
  await page.goto('/wards/?metric=households&period=2026-08-01');
  await page.getByRole('link', { name: 'このページの誤りを知らせる' }).click();
  await expect(page.getByLabel('対象ページのURL')).toHaveValue(/metric=households/);
  await expect(page.getByLabel('対象ページのURL')).toHaveValue(/period=2026-08-01/);
  await expect(page.getByLabel('対象箇所・表示していた版')).toHaveValue(
    /人口データ SHA-256:[a-f0-9]{64}; データ公開版:[a-f0-9]{64}/,
  );
});
