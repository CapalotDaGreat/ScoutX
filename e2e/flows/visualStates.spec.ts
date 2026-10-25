import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { accounts, openGuestHome, requireEmulators, signIn, trackPageErrors } from './helpers';

requireEmulators();
test.setTimeout(180_000);

async function assertNoPageOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test('narrow German light, offline retained content, and dark guest states render', async ({ browser }) => {
  fs.mkdirSync('.local/next-era-visual', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce', locale: 'en-US' });
  await context.addInitScript(() => {
    localStorage.setItem('@scoutx/theme-preference', 'light');
  });
  const page = await context.newPage();
  const errors = trackPageErrors(page);
  await signIn(page, accounts.seededPlayer.email);
  // Change the real stored preference after sign-in so shared English auth helpers stay deterministic.
  await context.addInitScript(() => {
    localStorage.setItem('@scoutx/language', 'de');
    localStorage.setItem('@scoutx/theme-preference', 'light');
  });
  await page.goto('/player/home');
  await expect(page.getByRole('heading', { name: 'Start', exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(accounts.seededPlayer.name).first()).toBeVisible({ timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await assertNoPageOverflow(page);
  await page.screenshot({ path: '.local/next-era-visual/player-de-light-320.png', animations: 'disabled' });
  await context.setOffline(true);
  await expect(page.getByText('Offline — Entwuerfe bleiben', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(accounts.seededPlayer.name).first()).toBeVisible();
  await page.screenshot({ path: '.local/next-era-visual/player-de-light-offline-320.png', animations: 'disabled' });
  await context.setOffline(false);
  expect(errors).toEqual([]);
  await context.close();

  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await guestContext.addInitScript(() => {
    localStorage.setItem('@scoutx/language', 'en');
    localStorage.setItem('@scoutx/theme-preference', 'dark');
  });
  const guest = await guestContext.newPage();
  await openGuestHome(guest);
  await assertNoPageOverflow(guest);
  await guest.screenshot({ path: '.local/next-era-visual/guest-dark-390.png', animations: 'disabled' });
  await guestContext.close();
});

test('tablet-sized scout web workspace renders without page overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('@scoutx/language', 'en');
    localStorage.setItem('@scoutx/theme-preference', 'light');
  });
  const page = await context.newPage();
  await signIn(page, accounts.scout.email);
  await page.goto('/scout/discover');
  await expect(page.getByText('Discover Players', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await assertNoPageOverflow(page);
  fs.mkdirSync('.local/next-era-visual', { recursive: true });
  await page.screenshot({ path: '.local/next-era-visual/scout-light-1024.png', animations: 'disabled' });
  await context.close();
});
