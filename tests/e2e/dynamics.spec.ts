import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('citizen reaches annual breakdown and same-period comparison', async ({ page }) => {
  await page.goto('/wards/kohoku/');
  await page.getByRole('link', { name: '港北区の出生・死亡・転出入の内訳を見る →' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('港北区');
  await expect(
    page.getByText('区別の月次内訳は掲載していません。', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: '18区の増減を比較する' }).click();
  await page.getByLabel('比べる指標').selectOption('births');
  await page.getByLabel('集計する年').selectOption('2024');
  await expect(page.locator('#movement-body tr')).toHaveCount(18);
  await expect(page.locator('#movement-caption')).toContainText('2024年1月〜12月の出生');
  await page.reload();
  await expect(page.getByLabel('比べる指標')).toHaveValue('births');
  await expect(page.getByLabel('集計する年')).toHaveValue('2024');
  await expect(page.locator('#movement-body .source-icon').first()).toHaveAttribute(
    'href',
    /02\.html$/,
  );
});
test('movement report retains exact data version, metric and year', async ({ page }) => {
  await page.goto('/population-movement/?metric=other_change&year=2025');
  await expect(page.locator('#movement-heading')).toContainText('その他増減');
  await page.getByRole('link', { name: 'このページの誤りを知らせる' }).click();
  await expect(page.locator('#report-page')).toHaveValue(
    'https://open.yokohama/population-movement/?metric=other_change&year=2025',
  );
  await expect(page.locator('#report-context')).toHaveValue(/人口動態 SHA-256:[a-f0-9]{64}/);
});
test('movement JSON, CSV and sources share values and version', async ({ request }) => {
  const response = await request.get('/data/dynamics.json');
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const source = data.snapshots.find((s: { scope: string }) => s.scope === 'year');
  const original = await request.get(`/data/raw/${source.id}.csv`);
  expect(original.ok()).toBe(true);
  const csv = await request.get('/data/dynamics.csv');
  expect(await csv.text()).toContain('"2025","暦年（1月〜12月）"');
  expect(
    data.observations.find(
      (o: { period: string; geography: string; metric: string }) =>
        o.period === '2025' && o.geography === '141003' && o.metric === 'total_change',
    ).value,
  ).toBe(164);
});
test('movement pages work without JavaScript and local search finds births', async ({
  browser,
  page,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const noJs = await context.newPage();
  await noJs.goto(
    new URL('/population-movement/kohoku/', test.info().project.use.baseURL as string).href,
  );
  await expect(noJs.locator('tbody tr')).toHaveCount(26);
  await context.close();
  await page.goto('/search/');
  await page.getByRole('searchbox').fill('出生');
  await expect(page.locator('#search-results a[href="/population-movement/"]')).toBeVisible();
});
test('movement stays accessible with day, night and seasonal themes', async ({ page }) => {
  for (const theme of ['yokohama', 'yokohama-night', 'green-expo']) {
    for (const path of ['/population-movement/', '/population-movement/kohoku/']) {
      await page.goto(`${path}?theme=${theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    }
  }
});
