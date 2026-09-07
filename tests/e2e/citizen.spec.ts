import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('citizen can find a ward, compare, and open the actual source', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('横浜の暮らし');
  await page.getByRole('link', { name: '港北区', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('港北区の、いまを知る。');
  await page.getByRole('link', { name: 'ほかの区と比べる →' }).click();
  await page.getByLabel('比べる指標').selectOption('household_size');
  await expect(page.locator('#value-heading')).toContainText('1世帯あたり人数');
  await page.getByLabel('統計の時点').selectOption('2024-01-01');
  await expect(page.locator('#comparison-body tr')).toHaveCount(18);
  await page.locator('#comparison-body a.cite').first().click();
  await expect(page).toHaveURL(/sources\/#s-/);
  const id = new URL(page.url()).hash;
  const link = page.locator(id).getByRole('link', { name: '取得時点の原本 ↓' });
  const response = await page.request.get((await link.getAttribute('href')) ?? '');
  expect(response.status()).toBe(200);
  expect((await response.body()).byteLength).toBeGreaterThan(500);
});
test('retired guides redirect to the matching data without remaining in discovery', async ({
  page,
  request,
}) => {
  for (const metric of ['population', 'households', 'density']) {
    for (const suffix of ['/', '']) {
      const response = await request.get(`/issues/${metric}${suffix}`, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      const location = new URL(response.headers().location, response.url());
      expect(location.pathname).toBe('/wards/');
      expect(location.searchParams.get('metric')).toBe(metric);
    }
    await page.goto(`/issues/${metric}/`);
    await expect(page.getByLabel('比べる指標')).toHaveValue(metric);
    await expect(page.locator('#comparison-body tr')).toHaveCount(18);
  }
  for (const route of ['/', '/issues/', '/search/']) {
    await page.goto(route);
    await expect(
      page.locator(
        'a[href^="/issues/population"], a[href^="/issues/households"], a[href^="/issues/density"]',
      ),
    ).toHaveCount(0);
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const metric of ['population', 'households', 'density'])
    expect(sitemap).not.toContain(`/issues/${metric}/`);
});
test('local search handles Japanese and zero results without a server request', async ({
  page,
}) => {
  await page.goto('/search/');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.getByRole('searchbox').fill('都筑');
  await expect(page.locator('#search-results .result')).toHaveCount(1);
  await page.getByRole('searchbox').fill('<script>not-a-query</script>');
  await expect(page.getByRole('status')).toContainText('0件');
  expect(requests).toHaveLength(0);
});
test('core pages have no serious accessibility defects or horizontal overflow', async ({
  page,
}) => {
  for (const path of ['/', '/wards/', '/issues/', '/search/']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
test('invalid route returns real 404', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ページが見つかりません');
});

test('comparison controls wait for their code on a slow connection', async ({ page }) => {
  let release: (() => void) | undefined;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_astro/*.js', async (route) => {
    await delayed;
    await route.continue();
  });
  await page.goto('/wards/', { waitUntil: 'commit' });
  await expect(page.getByLabel('比べる指標')).toBeDisabled();
  release?.();
  await expect(page.getByLabel('比べる指標')).toBeEnabled();
  await page.getByLabel('比べる指標').selectOption('household_size');
  await expect(page.locator('#value-heading')).toContainText('1世帯あたり人数');
});
