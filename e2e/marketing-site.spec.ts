import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';

const origin = 'http://marketing.pitchproof.test';
const publicRoot = resolve('public');
const routes = ['welcome', 'features', 'players', 'scouts', 'about', 'faq', 'contact'];
const mimeTypes: Record<string, string> = {
  html: 'text/html', css: 'text/css', js: 'text/javascript',
  png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', woff2: 'font/woff2',
};

test('initial HTML includes route-specific canonical and social metadata', async () => {
  const socialImage = 'https://pitchproof.online/welcome/img/app/open-graph.png';
  for (const route of routes) {
    const html = readFileSync(resolve(publicRoot, route, 'index.html'), 'utf8');
    const head = html.split('</head>')[0];
    const canonical = `https://pitchproof.online/${route}/`;
    expect(head).toContain(`<link rel="canonical" href="${canonical}">`);
    expect(head).toContain(`<meta property="og:url" content="${canonical}">`);
    expect(head).toContain(`<meta property="og:image" content="${socialImage}">`);
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(head).toContain(`<meta name="twitter:image" content="${socialImage}">`);
    for (const name of ['og:title', 'og:description', 'twitter:title', 'twitter:description']) {
      expect(head).toContain(`${name}" content="`);
    }
  }
  const sitemap = readFileSync(resolve(publicRoot, 'sitemap.xml'), 'utf8');
  for (const route of routes) expect(sitemap).toContain(`<loc>https://pitchproof.online/${route}/</loc>`);
  expect(sitemap).not.toMatch(/\/(?:auth|guardian|player|scout|guest)\//);
  const robots = readFileSync(resolve(publicRoot, 'robots.txt'), 'utf8');
  for (const path of ['/api/', '/auth/', '/guardian/', '/player/', '/scout/', '/guest/']) {
    expect(robots).toContain(`Disallow: ${path}`);
  }
  expect(robots).toContain('Sitemap: https://pitchproof.online/sitemap.xml');
});

test.beforeEach(async ({ page }) => {
  await page.route(`${origin}/**`, async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = resolve(publicRoot, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
    if (!file.startsWith(`${publicRoot}${sep}`) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }
    const extension = file.split('.').pop() ?? '';
    await route.fulfill({ path: file, contentType: mimeTypes[extension] ?? 'application/octet-stream' });
  });
});

test('seven routes have accessible structure, valid links and stable responsive layouts', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of routes) {
    await page.goto(`${origin}/${route}/`);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Footer', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), route).toBeLessThanOrEqual(1);
    const links = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
    for (const href of links) {
      const url = new URL(href, page.url());
      if (url.origin !== origin) continue;
      const file = resolve(publicRoot, `.${url.pathname}${url.pathname.endsWith('/') ? 'index.html' : ''}`);
      expect(existsSync(file), `${route}: ${href}`).toBe(true);
      if (url.hash) expect(readFileSync(file, 'utf8'), href).toContain(`id="${url.hash.slice(1)}"`);
    }
    const source = readFileSync(resolve(publicRoot, route, 'index.html'), 'utf8');
    expect(source).not.toMatch(/img\/(?:home|passport|passport-3|stats-2|development|scout-discover)\.jpg/);
    await page.screenshot({ path: testInfo.outputPath(`${route}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('hero states the product, keeps both audience actions on the first screen and shows real app screens', async ({ page }) => {
  await page.goto(`${origin}/welcome/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Your football, on the record.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'PitchProof home' })).toBeVisible();
  await expect(page.locator('.hero .status-chip')).toHaveText('Coming soon · not yet on the App Store');
  await expect(page.getByRole('link', { name: 'I am a player' })).toHaveAttribute('href', '/players/');
  await expect(page.getByRole('link', { name: 'I am a scout' })).toHaveAttribute('href', '/scouts/');
  const actionsBottom = await page.locator('.hero .actions').evaluate((element) => element.getBoundingClientRect().bottom);
  expect(actionsBottom).toBeLessThan(await page.evaluate(() => innerHeight));
  await expect(page.locator('.hero-caption')).toHaveText('App screens · fictional demonstration data');
  await expect(page.locator('.site-footer .release-label')).toHaveText('Coming soon · not yet on the App Store');
  for (const image of await page.locator('.hero-visual img').all()) {
    if (!(await image.isVisible())) continue;
    await expect(image).toHaveAttribute('src', /^\/welcome\/img\/app\/[a-z-]+-720\.webp$/);
    await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
  }
});

test('player and scout journeys reach real information and support', async ({ page }) => {
  await page.goto(`${origin}/welcome/`);
  await page.getByRole('link', { name: 'I am a player' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Put your work on record.');
  await page.getByRole('link', { name: 'Release and access FAQ' }).click();
  await expect(page.locator('#availability')).toHaveAttribute('open', '');
  await expect(page.locator('#availability')).toContainText('not available on the App Store');
  await page.goto(`${origin}/welcome/`);
  await page.getByRole('link', { name: 'I am a scout' }).click();
  await page.getByRole('link', { name: 'Contact PitchProof' }).click();
  await expect(page.locator('a[href="mailto:support@pitchproof.online"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Report content', exact: true }).first()).toHaveAttribute('href', '/report/');
});

test('keyboard navigation and reduced motion work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/welcome/`);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  const summary = page.locator('.navigation > summary');
  if (await summary.isVisible()) {
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(summary).toBeFocused();
    await expect(page.locator('.navigation')).not.toHaveAttribute('open', '');
  }
});

test('every app screen is a labelled capture of demonstration data with a meaningful description', async ({ page }) => {
  for (const route of ['welcome', 'features', 'players', 'scouts']) {
    await page.goto(`${origin}/${route}/`);
    for (const figure of await page.locator('.product-preview').all()) {
      await expect(figure.locator('figcaption')).toHaveText('App screen · fictional demonstration data');
    }
    const images = page.locator('main img[src^="/welcome/img/app/"]');
    expect(await images.count(), route).toBeGreaterThan(0);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute('src', /^\/welcome\/img\/app\/[a-z-]+-720\.webp$/);
      await expect(image).toHaveAttribute('srcset', /-360\.webp 360w, .*-720\.webp 720w$/);
      expect((await image.getAttribute('alt'))?.length ?? 0, route).toBeGreaterThan(30);
      const width = Number(await image.getAttribute('width'));
      const height = Number(await image.getAttribute('height'));
      expect(width).toBe(720);
      expect(height).toBeGreaterThan(700);
    }
    expect(await page.locator('main').innerText()).toMatch(/fictional demonstration data/);
  }
});

test('all app screens decode and the in-development review is labelled as unavailable', async ({ page }) => {
  for (const route of ['welcome', 'features', 'players', 'scouts']) {
    await page.goto(`${origin}/${route}/`);
    for (const image of await page.locator('main img[src^="/welcome/img/app/"]').all()) {
      if (!(await image.isVisible())) continue;
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    }
  }
  await page.goto(`${origin}/welcome/`);
  await expect(page.locator('#video .dev-label')).toHaveText('In development · not available in the app yet');
  await expect(page.locator('#video')).toContainText('Automatic player tracking is still being validated on real matches and is switched off.');
});

test('content, menu and FAQ remain usable without JavaScript', async ({ page }) => {
  await page.route(`${origin}/welcome/site.js`, (route) => route.abort());
  await page.goto(`${origin}/welcome/`);
  const summary = page.locator('.navigation > summary');
  if (await summary.isVisible() && await page.locator('.navigation').getAttribute('open') === null) {
    await summary.click();
  }
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'FAQ', exact: true }).click();
  await page.locator('#analysis > summary').click();
  await expect(page.locator('#analysis')).toContainText('Continuous tracking, automated events and pitch maps are unavailable.');
  await expect(page.locator('#analysis')).toHaveAttribute('open', '');
});

test('hero composition remains stable at compact and wide viewport sizes', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/welcome/`);
    const bounds = await page.locator('.hero').boundingBox();
    expect(bounds).not.toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const heading = await page.locator('.hero h1').boundingBox();
    const actions = await page.locator('.hero .actions').boundingBox();
    expect(heading?.y).toBeGreaterThanOrEqual(bounds?.y ?? 0);
    // both audience actions are reachable without scrolling, inside the hero
    expect((actions?.y ?? 0) + (actions?.height ?? 0)).toBeLessThan(viewport.height);
    expect((actions?.y ?? 0) + (actions?.height ?? 0)).toBeLessThan((bounds?.y ?? 0) + (bounds?.height ?? 0));
    await page.screenshot({ path: testInfo.outputPath(`hero-${viewport.width}.png`) });
  }
});
