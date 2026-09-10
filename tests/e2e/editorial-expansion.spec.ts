import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const slug of [
  'school-shelters',
  'mayor-powers',
  'childcare-access',
  'local-mobility',
  'city-budget',
  'green-expo',
  'city-governance',
  'population-facilities',
  'housing-access',
  'care-in-community',
  'waste-and-carbon',
  'city-building-history',
]) {
  test(`${slug}: figures and footnotes meet accessibility checks in both themes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    for (const theme of ['yokohama', 'yokohama-night']) {
      await page.goto(`/issues/${slug}/?theme=${theme}`);
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(audit.violations).toEqual([]);
    }
  });

  test(`${slug}: figures and footnotes work on narrow screens without JavaScript`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 900 },
    });
    const page = await context.newPage();
    const base = test.info().project.use.baseURL || 'http://127.0.0.1:8788';
    for (const theme of ['yokohama', 'yokohama-night']) {
      await page.goto(`${base}/issues/${slug}/?theme=${theme}`);
      await expect(page.locator('.editorial-figure')).toHaveCount(
        slug === 'childcare-access' ? 3 : slug === 'school-shelters' ? 2 : 1,
      );
      await expect(page.locator('.policy-deck')).toHaveCount(0);
      await expect(page.locator('.policy-toc a[href="#footnote-label"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const ref = page.locator('a[data-footnote-ref]').first();
      const href = await ref.getAttribute('href');
      await ref.click();
      expect(new URL(page.url()).hash).toBe(href);
      const note = page.locator(`[id="${href?.slice(1)}"]`);
      await expect(note).toBeVisible();
      const back = note.locator('a[data-footnote-backref]').first();
      const backHref = await back.getAttribute('href');
      await back.click();
      expect(new URL(page.url()).hash).toBe(backHref);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    if (slug === 'school-shelters') {
      await expect(page.locator('#gym-funding')).toContainText('1,470万円（0.3％）');
      await expect(page.locator('#gym-funding')).toContainText('市債は将来返す借入金');
      await expect(page.locator('#gym-timeline')).toContainText('完成・稼働の実績ではない');
    } else if (slug === 'mayor-powers') {
      await expect(page.locator('#mayor-roles')).toContainText('組織の上下関係を示す図ではない');
    }
    if (slug === 'childcare-access') {
      await expect(page.locator('#childcare-history .childcare-bar')).toHaveCount(4);
      await expect(page.locator('#childcare-ages .childcare-bar')).toHaveCount(6);
      await expect(page.locator('#childcare-ages')).toContainText(
        '育児休業の延長希望を除く1,256人',
      );
      await expect(page.locator('#childcare-counts')).toContainText('397');
      await expect(page.locator('#childcare-counts')).toContainText('1,276');
      await expect(page.locator('[data-childcare-map] svg [data-ward]')).toHaveCount(18);
    }
    if (slug === 'local-mobility') {
      await expect(page.locator('#mobility-support')).toContainText('運賃を支える');
      await expect(page.locator('#mobility-support')).toContainText('交通の運行を支える');
    }
    await context.close();
  });
}
