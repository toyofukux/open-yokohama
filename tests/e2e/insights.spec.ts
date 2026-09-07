import { expect, test } from '@playwright/test';

test('readings follow the selected metric, year and geography', async ({ page }) => {
  await page.goto('/population-movement/');
  const reading = page.locator('#movement-chart .chart-insights');
  await expect(reading).toContainText('神奈川区（+2,143人）');
  await page.getByLabel('比べる指標').selectOption('deaths');
  await expect(reading).toContainText('死亡が最も大きい');
  await expect(reading).not.toContainText('プラスは');
  await page.getByLabel('集計する年').selectOption('2000');
  await expect(reading).not.toContainText('神奈川区（+2,143人）');
  await page.goto('/age-structure/');
  await expect(page.locator('#age-chart .chart-insights')).toContainText('年齢不詳は2.6%');
  await page.getByLabel('推移を見る地域').selectOption('141097');
  await expect(page.locator('#age-history-chart figcaption')).toContainText('港北区');
  await expect(page.locator('#age-history-chart .chart-insights')).toContainText('ポイント');
});
test('static city reading explains natural loss and social gains without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    new URL('/population-movement/yokohama/', test.info().project.use.baseURL as string).href,
  );
  const reading = page.locator('.chart-insights').first();
  await expect(reading).toContainText('人口増減は+164人');
  await expect(reading).toContainText('その減少を上回り');
  await context.close();
});
