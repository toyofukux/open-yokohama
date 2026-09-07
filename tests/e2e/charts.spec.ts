import { expect, test } from '@playwright/test';

test('graphs follow period, metric and geography selectors', async ({ page }) => {
  await page.goto('/population-movement/');
  await expect(page.locator('#movement-chart .bar-row')).toHaveCount(18);
  await page.getByLabel('比べる指標').selectOption('natural_change');
  await page.getByLabel('集計する年').selectOption('2024');
  await expect(page.locator('#movement-chart figcaption')).toHaveText('2024年の自然増減（人）');
  const values = await page.locator('#movement-chart .bar-row strong').allTextContents();
  const table = await page.locator('#movement-body td.numeric').allTextContents();
  expect(values.map((v) => v.replace('+', ''))).toEqual(table);
  await page.getByLabel('比べる指標').selectOption('deaths');
  await expect(page.locator('#movement-chart .note')).toContainText('棒の長さで人数');
  await expect(page.locator('#movement-chart')).not.toContainText('右は増加');
  await page.goto('/age-structure/');
  await expect(page.locator('#age-chart .stack-row')).toHaveCount(19);
  await expect(page.locator('#age-chart .stack-track').first()).toHaveAttribute(
    'aria-label',
    /年齢不詳 2.6%/,
  );
  await page.getByLabel('年齢別人口の時点').selectOption('2000-01-01');
  await page.getByLabel('推移を見る地域').selectOption('141097');
  await expect(page.locator('#age-chart figcaption')).toContainText('2000-01-01');
  await expect(page.locator('#age-history-chart figcaption')).toContainText('港北区');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('graphs remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const base = test.info().project.use.baseURL as string;
  await page.goto(new URL('/population-movement/', base).href);
  await expect(page.locator('#movement-chart .bar-row')).toHaveCount(18);
  await page.goto(new URL('/age-structure/', base).href);
  await expect(page.locator('#age-chart .stack-row')).toHaveCount(19);
  await expect(page.locator('#age-history-chart svg.line-chart')).toBeVisible();
  await page.goto(new URL('/population-movement/yokohama/', base).href);
  await expect(page.locator('svg.line-chart').first()).toBeVisible();
  await context.close();
});
