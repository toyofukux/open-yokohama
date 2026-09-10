import { expect, test } from '@playwright/test';
import { allPolicyIssues } from '../../packages/core/policy-issues.ts';

// Tests that store a row run only against a local preview. Production must never receive test rows.
const localOnly = () => {
  const host = new URL(test.info().project.use.baseURL as string).hostname;
  test.skip(
    !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(host),
    'submission tests run only against a local preview',
  );
};

test('a policy article report carries its context and returns a receipt number', async ({
  page,
}) => {
  localOnly();
  await page.goto(allPolicyIssues[0].url);
  await page.getByRole('link', { name: 'このページについて知らせる' }).click();
  await expect(page.getByLabel('対象ページ（任意）')).toHaveValue(allPolicyIssues[0].url);
  await expect(page.locator('#report-version')).toHaveValue(/^記事 SHA-256:[a-f0-9]{64}$/);
  await expect(page.locator('#report-version-note')).toContainText('表示していた版：記事 SHA-256:');
  await page.getByLabel('質問').check();
  await page.getByLabel('内容（必須）').fill('統計の時点を確認したい');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/inquiries') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '送信する' }).click();
  const body = await (await response).json();
  expect(body.id).toBeGreaterThan(0);
  await expect(page.locator('#report-result')).toContainText(`受付番号は ${body.id} です`);
  await expect(page.locator('#report-form')).toBeHidden();
});

test('the article bottom link reaches the same form with the article version', async ({ page }) => {
  await page.goto(allPolicyIssues[0].url);
  await page.getByRole('link', { name: '数字や説明について知らせる' }).click();
  await expect(page).toHaveURL(/\/corrections\/report\/\?page=/);
  await expect(page.getByLabel('対象ページ（任意）')).toHaveValue(allPolicyIssues[0].url);
  await expect(page.locator('#report-version')).toHaveValue(/^記事 SHA-256:[a-f0-9]{64}$/);
});

test('untrusted report context is plain text and cannot redirect the target page', async ({
  page,
}) => {
  await page.goto('/corrections/report/?page=//evil.example/&target=%3Cimg%20src=x%3E&version=old');
  await expect(page.getByLabel('対象ページ（任意）')).toHaveValue('');
  await expect(page.locator('#report-version-note')).toHaveText(
    '対象：<img src=x>／表示していた版：old',
  );
  await expect(page.locator('article img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('comparison report preserves selected metric, period and both data versions', async ({
  page,
}) => {
  await page.goto('/wards/?metric=households&period=2026-08-01');
  await page.getByRole('link', { name: 'このページについて知らせる' }).click();
  await expect(page.getByLabel('対象ページ（任意）')).toHaveValue(/metric=households/);
  await expect(page.getByLabel('対象ページ（任意）')).toHaveValue(/period=2026-08-01/);
  await expect(page.locator('#report-version')).toHaveValue(
    /人口データ SHA-256:[a-f0-9]{64}; データ公開版:[a-f0-9]{64}/,
  );
});

test('the form works without JavaScript and lands on the receipt page', async ({ browser }) => {
  localOnly();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(new URL('/corrections/report/', test.info().project.use.baseURL as string).href);
  await page.getByLabel('内容（必須）').fill('JavaScriptなしの送信');
  await page.getByRole('button', { name: '送信する' }).click();
  await expect(page).toHaveURL(/\/corrections\/report\/done\/\?id=[1-9][0-9]*$/);
  await expect(page.locator('h1')).toHaveText('送信しました');
  await context.close();
});

test('the inquiry API rejects foreign origins and empty bodies, and stores nothing for bots', async ({
  request,
}) => {
  const json = { Accept: 'application/json' };
  const foreign = await request.post('/api/inquiries', {
    form: { body: 'x' },
    headers: { ...json, Origin: 'https://evil.example' },
  });
  expect(foreign.status()).toBe(403);
  const empty = await request.post('/api/inquiries', { form: { body: '   ' }, headers: json });
  expect(empty.status()).toBe(400);
  expect((await empty.json()).error).toBe('body');
  const bot = await request.post('/api/inquiries', {
    form: { body: 'spam', website: 'http://spam.example' },
    headers: json,
  });
  expect(bot.status()).toBe(200);
  expect((await bot.json()).id).toBeNull();
  expect((await request.get('/api/inquiries')).status()).toBe(405);
  // kind=other never validates, so even an edge that de-chunks the request stores nothing.
  const chunked = await request.post('/api/inquiries', {
    data: 'kind=other&body=x',
    headers: {
      ...json,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Transfer-Encoding': 'chunked',
    },
  });
  expect([411, 400]).toContain(chunked.status());
  const redirect = await request.post('/api/inquiries', {
    form: { body: '', page: '/about/' },
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(303);
  expect(redirect.headers().location).toMatch(
    /\/corrections\/report\/\?error=body&page=%2Fabout%2F$/,
  );
});
