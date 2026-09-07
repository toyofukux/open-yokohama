import { expect, test } from '@playwright/test';
import { allPolicyIssues } from '../../packages/core/policy-issues.ts';

test('active policy articles report their own content version for corrections', async ({
  page,
}) => {
  for (const issue of allPolicyIssues) {
    await page.goto(issue.url);
    const version = await page
      .locator('[data-content-version]')
      .getAttribute('data-content-version');
    expect(version).toMatch(/^[a-f0-9]{64}$/);
    const href = await page.locator('a[data-report-link]').getAttribute('href');
    const url = new URL(href ?? '', 'https://open.yokohama');
    expect(url.searchParams.get('page')).toBe(issue.url);
    expect(url.searchParams.get('version')).toBe(`記事 SHA-256:${version}`);
    await expect(page.locator('#review-status')).toContainText('未実施');
  }
});
