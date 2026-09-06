import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mayoralIssues, policyIssues } from '../../packages/core/policy-issues';

const compact = (text: string) => text.replace(/\s+/g, '');
const hub = '/elections/mayor-2026/';

test('all seven policy questions are reachable through the election hub and search', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator(`a[href="${hub}"]`).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('7つの問い');
  await expect(page.locator('.election-context')).toContainText('候補者の公約比較');
  for (const issue of policyIssues) {
    await expect(page.locator(`.cards a[href="${issue.url}"]`)).toHaveCount(1);
  }
  for (const issue of mayoralIssues) {
    await page.goto('/search/');
    await page.getByRole('searchbox').fill(issue.title);
    await page.locator(`#search-results a[href="${issue.url}"]`).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(issue.title);
  }
});

for (const issue of mayoralIssues) {
  test(`${issue.slug}: complete manuscript, real table labels and original sources survive rendering`, async ({
    page,
  }) => {
    const manuscript = readFileSync(`docs/content-review/mayoral-issues/${issue.slug}.md`, 'utf8');
    await page.goto(issue.url);
    await expect(page.locator('article')).toHaveAttribute(
      'data-content-version',
      createHash('sha256').update(manuscript).digest('hex'),
    );
    const body = manuscript.replace(/^---\n[\s\S]*?\n---\n/, '');
    const rendered = compact((await page.locator('.policy-prose').textContent()) ?? '');
    for (const line of body.split('\n')) {
      if (!line.trim() || /^\|[\s:|-]+\|$/.test(line)) continue;
      const passages = line.startsWith('|') ? line.split('|').slice(1, -1) : [line];
      for (const passage of passages) {
        const plain = passage
          .replace(/^#+\s*/, '')
          .replace(/^- /, '')
          .replace(/\*\*/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        expect(rendered, `Missing manuscript text: ${plain}`).toContain(compact(plain));
      }
    }
    const hrefs = await page
      .locator('.policy-prose a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    for (const link of body.matchAll(/\]\((https:\/\/[^)]+)\)/g)) expect(hrefs).toContain(link[1]);
    for (const table of await page.locator('.policy-prose table').all()) {
      const labels = await table.locator('th').allTextContents();
      for (const row of await table.locator('tbody tr').all()) {
        const cells = await row.locator('td').all();
        for (let i = 0; i < cells.length; i++) {
          await expect(cells[i]).toHaveAttribute('data-label', labels[i]);
        }
      }
    }
    await page.locator('.policy-toc').evaluate((node) => {
      (node as HTMLDetailsElement).open = true;
    });
    for (const href of await page
      .locator('.policy-toc ol a')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')))) {
      expect(await page.evaluate((id) => !!document.getElementById(id), href?.slice(1) ?? '')).toBe(
        true,
      );
    }
    await page.locator('#review-status summary').click();
    await expect(page.locator('#review-status')).toContainText('利用者による理解の検証は未実施');
  });
}

test('all new pages remain readable at 320px, 200% text and in both themes', async ({ page }) => {
  for (const theme of ['yokohama', 'yokohama-night']) {
    for (const route of [hub, ...mayoralIssues.map((issue) => issue.url)]) {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(`${route}?theme=${theme}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
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

test('facts, comparison and source navigation remain usable without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const base = test.info().project.use.baseURL || 'http://127.0.0.1:8788';
  for (const issue of mayoralIssues) {
    await page.goto(`${base}${issue.url}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(issue.title);
    await expect(page.locator('.policy-prose table').first()).toBeVisible();
    await page.locator('.policy-toc summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('navigation', { name: 'この記事の目次' })).toBeVisible();
    await page.locator('.source-jump').click();
    await expect(page).toHaveURL(/#article-sources$/);
  }
  await context.close();
});
