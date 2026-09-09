import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import data from '../../data/childcare/derived.json' with { type: 'json' };
import { policyIssues } from '../../packages/core/policy-issues';
import { featuredIndex } from '../../packages/core/presentation';

test('daily questions rotate coherently, manual controls wrap and campaign is independent', async ({
  page,
}) => {
  const date = new Date('2026-09-07T03:00:00Z');
  await page.clock.install({ time: date });
  await page.goto('/');
  const feature = page.locator('[data-policy-feature]');
  const campaign = page.locator('[data-election-campaign]');
  await expect(campaign).toBeVisible();
  await expect(feature.locator('[data-election-campaign]')).toHaveCount(0);
  const initial = featuredIndex(date, policyIssues.length);
  for (let step = 0; step < policyIssues.length + 1; step++) {
    const issue = policyIssues[(initial + step) % policyIssues.length];
    const active = feature.locator('[data-feature-item]:visible');
    await expect(active).toHaveCount(1);
    await expect(active.getByRole('heading')).toHaveText(issue.title);
    await expect(active.locator('a').last()).toHaveAttribute('href', issue.url);
    await feature.getByRole('button', { name: '次の問い' }).click();
  }
  await feature.getByRole('button', { name: '前の問い' }).click();
  await expect(feature.locator('[data-feature-item]:visible h3')).toHaveText(
    policyIssues[initial].title,
  );
  await page.clock.setFixedTime(new Date('2026-09-08T03:00:00Z'));
  await page.reload();
  await expect(feature.locator('[data-feature-item]:visible h3')).toHaveText(
    policyIssues[(initial + 1) % policyIssues.length].title,
  );
  await page.clock.setFixedTime(new Date('2026-10-19T03:00:00Z'));
  await page.reload();
  await expect(campaign).toBeHidden();
  await page.goto('/issues/');
  await expect(page.locator('a[href="/elections/mayor-2026/"]')).toBeVisible();
});

test('all 18 map labels, row values, keyboard table access and exports agree', async ({
  page,
  request,
}) => {
  await page.goto('/issues/childcare-access/');
  const figure = page.locator('[data-childcare-map]');
  await expect(figure.locator('path[data-ward]')).toHaveCount(18);
  await expect(figure.locator('path[data-band="high"]')).toHaveCount(4);
  await figure.getByText('18区の人数・割合と、前年の値を見る', { exact: true }).click();
  for (const ward of data.wards) {
    const row = figure.locator(`#childcare-${ward.slug}`);
    await expect(row).toContainText(`${ward.rate.toFixed(1)}％`);
    await expect(row).toContainText(`${ward.applicants.toLocaleString('ja-JP')}人`);
    await figure.locator('select').selectOption(ward.code);
    await expect(figure.locator('[role="status"]')).toContainText(
      `${ward.held.toLocaleString('ja-JP')}人`,
    );
    await expect(figure.locator('[data-selected]')).toHaveAttribute('data-ward', ward.code);
  }
  await figure.locator('select').focus();
  await expect(figure.locator('select')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(figure.locator('.ward-data-table summary')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(figure.locator('.ward-data-table table')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(figure.locator('.ward-data-table table')).toBeVisible();
  for (const ext of ['svg', 'png', 'csv']) {
    const response = await request.get(`/maps/childcare-2026.${ext}`);
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeGreaterThan(1000);
  }
});

test('home and expanded ward evidence support narrow screens, enlarged text and both themes', async ({
  page,
}) => {
  for (const theme of ['yokohama', 'yokohama-night']) {
    for (const route of ['/', '/issues/childcare-access/']) {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(`${route}?theme=${theme}`);
      await page.locator('.ward-evidence details').evaluateAll((nodes) =>
        nodes.forEach((node) => {
          (node as HTMLDetailsElement).open = true;
        }),
      );
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(audit.violations).toEqual([]);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
  }
});

test('map, table and all questions remain reachable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const base = test.info().project.use.baseURL || 'http://127.0.0.1:8788';
  await page.goto(`${base}/`);
  await expect(page.locator('[data-feature-item]:visible')).toHaveCount(1);
  await expect(page.locator('.feature-controls')).toBeHidden();
  await page.getByRole('link', { name: '気になる問いを探す' }).click();
  for (const issue of policyIssues)
    await expect(page.locator(`a[href="${issue.url}"]`)).toBeVisible();
  await page.goto(`${base}/issues/childcare-access/`);
  await expect(page.locator('.ward-map-canvas svg')).toBeVisible();
  await expect(page.locator('.ward-map-controls')).toBeHidden();
  await page.locator('.ward-data-table summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ward-data-table tbody tr')).toHaveCount(18);
  await expect(page.locator('.ward-data-table table')).toBeVisible();
  await context.close();
});
