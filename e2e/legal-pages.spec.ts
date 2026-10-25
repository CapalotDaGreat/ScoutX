import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';

const origin = 'http://legal.pitchproof.test';
const publicRoot = resolve('public');
const documentIds = [
  'privacy-policy', 'terms-of-service', 'community-guidelines', 'youth-safety-policy',
  'guardian-consent-notice', 'video-recording-policy', 'ai-use-policy', 'copyright-policy',
  'reporting-takedown-policy', 'data-subject-rights', 'data-retention-policy',
  'security-disclosure-policy', 'cookie-tracking-policy', 'subscription-terms',
];
const paths = [
  '/privacy/', '/terms/', '/subscription-terms/', '/support/', '/legal/',
  '/legal-notice/', '/account-deletion/', ...documentIds.map((id) => `/legal/${id}/`),
];

function publicFile(pathname: string): string {
  const path = decodeURIComponent(pathname);
  const file = resolve(publicRoot, `.${path}${path.endsWith('/') ? 'index.html' : ''}`);
  if (!file.startsWith(`${publicRoot}${sep}`)) throw new Error('Path outside public site');
  return file;
}

test.beforeEach(async ({ page }) => {
  // Serve the generated files in-browser without a live site, Expo server or deployment.
  await page.route(`${origin}/**`, async (route) => {
    const file = publicFile(new URL(route.request().url()).pathname);
    if (!existsSync(file)) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }
    await route.fulfill({ path: file });
  });
});

test('all legal pages have accessible structure, working local links and no horizontal overflow', async ({ page }) => {
  const destinations = new Set<string>();
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  for (const path of paths) {
    await page.goto(`${origin}${path}`);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Footer' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/(?:LEGAL|PRIVACY|SECURITY)_CONTACT_REQUIRED/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
    const links = await page.locator('a').evaluateAll((anchors) => anchors
      .map((anchor) => anchor.getAttribute('href'))
      .filter((href): href is string => href !== null));
    for (const link of links) {
      const url = new URL(link, page.url());
      if (url.origin === origin) destinations.add(url.href);
    }
  }
  for (const destination of destinations) {
    const url = new URL(destination);
    const file = publicFile(url.pathname);
    expect(existsSync(file), destination).toBe(true);
    if (url.hash && file.endsWith('.html')) {
      expect(readFileSync(file, 'utf8'), destination).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
    }
  }
  expect(runtimeErrors).toEqual([]);
});

test('support links reach operator details and account-deletion instructions', async ({ page }, testInfo) => {
  await page.goto(`${origin}/support/`);
  await expect(page.locator('a[href="mailto:support@pitchproof.online"]')).toHaveCount(2);
  await page.screenshot({ path: resolve(`.local/legal-${testInfo.project.name}-support.png`), fullPage: true });
  await page.getByRole('link', { name: 'account deletion instructions' }).click();
  await expect(page.getByRole('heading', { name: 'Delete your PitchProof account', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('does not cancel an Apple subscription');
  await expect(page.getByRole('link', { name: 'Apple subscription settings' }))
    .toHaveAttribute('href', 'https://apps.apple.com/account/subscriptions');
  await page.screenshot({ path: resolve(`.local/legal-${testInfo.project.name}-deletion.png`), fullPage: true });
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Legal notice' }).click();
  await expect(page.getByRole('main')).toContainText('CML Electronics');
  await expect(page.getByRole('main')).toContainText('8600 Dübendorf');
  await page.screenshot({ path: resolve(`.local/legal-${testInfo.project.name}-notice.png`), fullPage: true });
});

test('keyboard users can reach the skip link', async ({ page }) => {
  await page.goto(`${origin}/support/`);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});

test('revised policies visibly remain pending review and provide usable Apple links', async ({ page }, testInfo) => {
  await page.goto(`${origin}/privacy/`);
  await expect(page.getByText('Draft under legal review.', { exact: true })).toBeVisible();
  await expect(page.getByText('Effective date pending legal review', { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(`.local/legal-${testInfo.project.name}-privacy.png`) });
  await page.goto(`${origin}/subscription-terms/`);
  await expect(page.locator('a[href="https://apps.apple.com/account/subscriptions"]')).toHaveCount(1);
  await expect(page.locator('a[href="https://reportaproblem.apple.com/"]')).toHaveCount(1);
});
