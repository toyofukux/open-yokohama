import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const path = '/issues/school-lunch/';
const manuscript = readFileSync('docs/content-review/school-lunch/DRAFT.md', 'utf8');
const evidence = JSON.parse(readFileSync('docs/content-review/school-lunch/evidence.json', 'utf8'));
const compact = (text: string) => text.replace(/\s+/g, '');

test('the issue is discoverable from home, the issue index and local search', async ({ page }) => {
  for (const entrance of ['/', '/issues/']) {
    await page.goto(entrance);
    if (entrance === '/') {
      await page.getByRole('link', { name: '気になる問いを探す' }).click();
    }
    await page.locator(`a[href="${path}"]`).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('無償化すべきか');
  }
  await page.goto('/search/');
  await page.getByRole('searchbox').fill('給食');
  await page.locator(`#search-results a[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
});

test('the rendered article preserves every manuscript passage and source link', async ({
  page,
}) => {
  await page.goto(path);
  await expect(page.locator('article')).toHaveAttribute(
    'data-content-version',
    evidence.manuscript.sha256,
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const rendered = compact((await page.locator('.policy-prose').textContent()) ?? '');
  const lines = manuscript.split('\n').slice(2);
  for (const line of lines) {
    if (
      !line.trim() ||
      line.startsWith('<!--') ||
      line === '---' ||
      line.startsWith('[![') ||
      /^\|[-|]+\|$/.test(line)
    )
      continue;
    const passages = line.startsWith('|') ? line.split('|').slice(1, -1) : [line];
    for (const passage of passages) {
      const plain = passage
        .replace(/^#+\s*/, '')
        .replace(/^- /, '')
        .replace(/\*\*/g, '')
        .replace(/^\[\^\d+\]: /, '')
        .replace(/\[([^\]]+)\]\(https:\/\/[^)]+\)/g, '$1')
        .replace(/\[\^\d+\]/g, '');
      expect(rendered, `Missing manuscript passage: ${plain}`).toContain(compact(plain));
    }
  }
  for (const match of manuscript.matchAll(/\]\((https:\/\/[^)]+)\)/g)) {
    expect(
      await page
        .locator('.policy-prose a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ).toContain(match[1]);
  }
  const navigation = page.getByRole('navigation', { name: 'この記事の目次' });
  if (
    !(await page.locator('.policy-toc').evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await page.locator('.policy-toc summary').click();
  }
  await expect(navigation.locator('ol a')).toHaveCount(5);
  for (const href of await navigation
    .locator('ol a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')))) {
    expect(
      await page.evaluate((id) => Boolean(document.getElementById(id)), href?.slice(1) ?? ''),
    ).toBe(true);
  }
  await page.getByText('この原稿の確認範囲と、残っていること', { exact: true }).click();
  await expect(page.locator('#review-status')).toContainText(
    '独立した事実確認と利用者による理解の検証は未実施',
  );
});

test('the complete answer, comparison and sources work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL || 'http://127.0.0.1:8788'}${path}`);
  await expect(page.locator('.policy-prose table').first()).toBeVisible();
  await expect(page.locator('.policy-prose')).toContainText(
    '市に追加で必要となる額は、今回確認した資料では未確定',
  );
  await page.locator('.policy-toc summary').click();
  await expect(page.getByRole('navigation', { name: 'この記事の目次' })).toBeVisible();
  await page.locator('#review-status summary').click();
  await expect(page.locator('#review-status p').first()).toBeVisible();
  await context.close();
});

test('policy reading works at narrow widths and in both themes', async ({ page }) => {
  for (const theme of ['yokohama', 'yokohama-night']) {
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${path}?theme=${theme}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      if (width <= 390) {
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
  }
});

test('the original figure and all footnotes retain attribution and return navigation', async ({
  page,
}) => {
  await page.goto(path);
  const figure = page.locator('.policy-prose figure');
  await expect(figure.locator('img')).toHaveAttribute('alt', /2021年.*52.6％/);
  expect(
    await figure.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await expect(figure.locator('figcaption')).toContainText(
    'Open Yokohamaが原資料から図表部分を切り出した',
  );
  expect(
    await figure
      .locator('figcaption')
      .evaluate((caption) => parseFloat(getComputedStyle(caption).fontSize)),
  ).toBeLessThan(
    await page
      .locator('.policy-prose')
      .evaluate((body) => parseFloat(getComputedStyle(body).fontSize)),
  );
  await expect(page.locator('.footnotes ol > li')).toHaveCount(11);
  const refs = page.locator('a[data-footnote-ref]');
  for (let i = 0; i < (await refs.count()); i++) {
    const ref = refs.nth(i);
    const href = await ref.getAttribute('href');
    await ref.click();
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(href);
    const back = page.locator(`[id="${href?.slice(1)}"] a[data-footnote-backref]`).first();
    const backHref = await back.getAttribute('href');
    await back.click();
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(backHref);
  }
  const imageHref = await figure.locator('a:has(img)').getAttribute('href');
  if (!imageHref) throw new Error('Figure link missing');
  const response = await page.request.get(imageHref);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
  await figure.locator('a:has(img)').click();
  expect(new URL(page.url()).pathname).toBe(imageHref);
});
