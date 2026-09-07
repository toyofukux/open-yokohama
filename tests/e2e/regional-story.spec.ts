import { expect, test } from '@playwright/test';

test('regional paragraphs precede evidence and tables are optional', async ({ page }) => {
  await page.goto('/population-movement/');
  const story = page.locator('#movement-story');
  await expect(story).toContainText('年平均約3万人');
  await expect(story).toContainText('移動手段を変える');
  await expect(story).toContainText('到達時間、維持費');
  expect(
    await page.evaluate(() => {
      const story = document.querySelector('#movement-story');
      const chart = document.querySelector('#movement-chart');
      return Boolean(
        story && chart && story.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
  await expect(page.locator('#movement-body')).not.toBeVisible();
  await page.getByText('18区の数値と出典を表で確認する', { exact: true }).click();
  await expect(page.locator('#movement-body')).toBeVisible();
  await expect(page.locator('#movement-body tr')).toHaveCount(18);
  await page.getByLabel('集計する年').selectOption('2000');
  await expect(story).toContainText('5年分がそろわず');
  await expect(story).not.toContainText('2021〜2025年');
});
test('age narrative and indexed count chart follow region, separately from comparison date', async ({
  page,
}) => {
  await page.goto('/age-structure/');
  await expect(page.locator('#age-story')).toContainText('総人口は約1.1倍、65歳以上は約2.1倍');
  await expect(page.locator('#age-story')).toContainText('高齢化が落ち着いたとは言えません');
  await expect(page.locator('#age-index-chart svg.line-chart')).toBeVisible();
  await expect(page.locator('#age-index-chart')).not.toContainText('人下がっています');
  await expect(page.locator('#age-history')).not.toBeVisible();
  await page.getByLabel('推移を見る地域').selectOption('141097');
  await expect(page.locator('#age-story h2')).toContainText('港北区');
  await expect(page.locator('#age-index-chart figcaption')).toContainText('港北区');
  await page.getByText('年ごとの人数・割合を表で確認する', { exact: true }).click();
  await expect(page.locator('#age-history')).toBeVisible();
  await expect(page.locator('#age-history tr')).toHaveCount(26);
});
test('narrative and native table disclosure work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    new URL('/population-movement/yokohama/', test.info().project.use.baseURL as string).href,
  );
  await expect(page.locator('#regional-story')).toContainText('以前は出生と移動の両方');
  await expect(page.locator('tbody').first()).not.toBeVisible();
  await page.getByText('年・月別の数値と出典を表で確認する', { exact: true }).first().click();
  await expect(page.locator('tbody').first()).toBeVisible();
  await context.close();
});
