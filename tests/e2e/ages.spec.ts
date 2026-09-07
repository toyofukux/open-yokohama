import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('age comparison preserves region labels and unknown-inclusive percentages', async ({
  page,
}) => {
  await page.goto('/age-structure/');
  await expect(page.locator('#age-body tr')).toHaveCount(19);
  await expect(page.locator('#age-body tr').first().locator('th')).toHaveText('横浜市');
  await expect(page.locator('#age-body tr').first().locator('td').last()).toHaveText(
    '98,789（2.6%）',
  );
  await page.getByLabel('年齢別人口の時点').selectOption('2024-01-01');
  await page.getByLabel('推移を見る地域').selectOption('141097');
  await expect(page.locator('#age-caption')).toContainText('2024-01-01');
  await expect(page.locator('#age-history-caption')).toContainText('港北区');
  await expect(page.locator('#age-history tr').first().locator('th')).toHaveText('2025-01-01');
  await page.reload();
  await expect(page.getByLabel('推移を見る地域')).toHaveValue('141097');
  await page.getByRole('link', { name: 'このページの誤りを知らせる' }).click();
  await expect(page.locator('#report-context')).toHaveValue(/年齢別人口 SHA-256:[a-f0-9]{64}/);
  await expect(page.locator('#report-page')).toHaveValue(/period=2024-01-01&geography=141097/);
});
test('static age tables retain headings when JavaScript is disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(new URL('/age-structure/', test.info().project.use.baseURL as string).href);
  await expect(page.locator('#age-body tr').first().locator('th')).toHaveText('横浜市');
  await expect(page.locator('#age-history tr').first().locator('th')).toHaveText('2025-01-01');
  await expect(page.locator('#age-body tr').first().locator('td')).toHaveCount(5);
  await context.close();
});
test('age JSON and CSV preserve source rows and January reference dates', async ({ request }) => {
  const json = await (await request.get('/data/ages.json')).json();
  expect(json.records.length).toBe(494);
  const csv = await (await request.get('/data/ages.csv')).text();
  expect(csv).toContain('"2025-01-01","1月1日現在の推計人口"');
  expect((await request.get(`/data/raw/${json.snapshots[0].id}.csv`)).ok()).toBe(true);
});
test('age table is accessible across themes without page overflow', async ({ page }) => {
  for (const theme of ['yokohama', 'yokohama-night', 'green-expo']) {
    await page.goto(`/age-structure/?theme=${theme}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
});
