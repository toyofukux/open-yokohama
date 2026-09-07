import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('long-term article shows decades, explicit rebasing and reproducible input packet', async ({
  page,
  request,
}) => {
  await page.goto('/population-history/');
  await expect(page.locator('h1')).toContainText('横浜市');
  await expect(page.locator('#population')).toContainText('3,307,136');
  await expect(page.locator('#population')).toContainText('3,771,063');
  await expect(page.locator('#monthly')).toContainText('2025年10月');
  await expect(page.locator('#monthly polyline')).toHaveCount(2);
  const packet = await (await request.get('/data/warehouse/articles/yokohama.json')).json();
  expect(packet.article.inputs.length).toBe(packet.observations.length);
  expect(packet.article.calculations.length).toBeGreaterThan(0);
  const manifest = await (
    await request.get(`/data/warehouse/releases/${packet.releaseId}/manifest.json`)
  ).json();
  expect((await request.get(`/data/warehouse/objects/${manifest.articles}.json`)).ok()).toBe(true);
  await page.getByRole('link', { name: '港北区', exact: true }).click();
  await expect(page.locator('h1')).toContainText('港北区');
  await expect(page.locator('#population')).toContainText('279,333');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
test('existing guides lead to the relevant long time span and catalogue discloses source differences', async ({
  page,
}) => {
  await page.goto('/wards/kohoku/');
  await expect(
    page.getByRole('link', { name: '人口と暮らしを、約30年の変化で見る →' }),
  ).toHaveAttribute('href', '/population-history/kohoku/');
  await page.goto('/datasets/');
  await expect(page.locator('main')).toContainText('435.23');
  await expect(page.locator('main')).toContainText('435.21');
});
