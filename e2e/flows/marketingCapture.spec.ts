import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { accounts, requireEmulators, signIn, trackPageErrors } from './helpers';

requireEmulators();
test.skip(process.env.MARKETING_CAPTURE !== '1', 'Explicit local marketing capture only');
test.setTimeout(360_000);

test('capture genuine updated Expo web screens with emulator demonstration data', async ({ browser }, info) => {
  test.skip(info.project.name !== 'web-desktop', 'One deterministic phone capture family');
  const root = path.resolve('public/welcome/img/next-era');
  fs.mkdirSync(root, { recursive: true });
  const captures: Array<{ file: string; route: string; width: number; height: number; platform: string }> = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('@scoutx/theme-preference', 'dark'));
  const page = await context.newPage();
  const errors = trackPageErrors(page);

  async function capture(target: Page, name: string, route: string, ready: string) {
    await target.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(target.getByText(ready, { exact: false }).first()).toBeVisible({ timeout: 90_000 });
    await expect(target.getByRole('heading').first()).toBeVisible({ timeout: 90_000 });
    await target.evaluate(() => document.fonts.ready);
    await expect(target.getByText(accounts.seededPlayer.privateBiographyMarker, { exact: false })).toHaveCount(0);
    await target.screenshot({ path: path.join(root, `${name}.png`), animations: 'disabled' });
    captures.push({ file: `${name}.png`, route, width: 390, height: 844, platform: 'Expo web preview; not a native iOS capture' });
  }

  await signIn(page, accounts.seededPlayer.email);
  await capture(page, 'today', '/player/home', accounts.seededPlayer.name);
  await capture(page, 'performance', '/player/performance?segment=stats', 'Match history');
  await capture(page, 'media', '/player/media', 'Your library is empty for now.');
  await context.close();

  const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await visitorContext.addInitScript(() => localStorage.setItem('@scoutx/theme-preference', 'dark'));
  const visitorPage = await visitorContext.newPage();
  const visitorErrors = trackPageErrors(visitorPage);
  await capture(visitorPage, 'passport', `/player/${accounts.seededPlayer.username}`, accounts.seededPlayer.name);
  await visitorContext.close();

  const scoutContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await scoutContext.addInitScript(() => localStorage.setItem('@scoutx/theme-preference', 'dark'));
  const scoutPage = await scoutContext.newPage();
  const scoutErrors = trackPageErrors(scoutPage);
  await signIn(scoutPage, accounts.scout.email);
  await capture(scoutPage, 'discovery', '/scout/discover', 'Discover');
  await capture(scoutPage, 'pipeline', '/scout/pipeline', 'Pipeline');
  await capture(scoutPage, 'trials', '/scout/trials', 'No trial invitations');
  await scoutContext.close();
  expect([...errors, ...visitorErrors, ...scoutErrors]).toEqual([]);
  const sourceHash = createHash('sha256');
  function hashDirectory(directory: string): void {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) hashDirectory(file);
      else if (item.isFile()) sourceHash.update(file.replaceAll('\\', '/')).update(fs.readFileSync(file));
    }
  }
  hashDirectory('src');
  sourceHash.update(fs.readFileSync('package.json'));
  fs.writeFileSync(path.join(root, 'capture-manifest.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), fixture: 'e2e/fixtures/accounts.json', project: accounts.projectId,
    platform: 'Expo web', build: 'Expo 57 local development, Firebase demo emulators', sourceSha256: sourceHash.digest('hex'),
    locale: 'en', theme: 'dark', nativeAppStoreStatus: 'pending native iOS capture', demonstrationData: true, captures,
  }, null, 2) + '\n');
});
