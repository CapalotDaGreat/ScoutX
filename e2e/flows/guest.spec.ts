import { expect, test } from '@playwright/test';
import { accounts, requireEmulators, trackPageErrors } from './helpers';

requireEmulators();

test.describe('Guest: public Football Passport', () => {
  test('shows the public projection and leaks no private profile data', async ({ page }) => {
    const errors = trackPageErrors(page);
    const seeded = accounts.seededPlayer;

    await page.goto(`/player/${seeded.username}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(seeded.name).first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(seeded.club).first()).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).not.toContain(seeded.privateBiographyMarker);
    expect(body).not.toContain(seeded.phone);
    expect(body).not.toContain(seeded.email);
    expect(errors).toEqual([]);
  });

  test('an unknown username does not invent a player', async ({ page }) => {
    await page.goto('/player/nobody-by-this-name', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(accounts.seededPlayer.name)).toHaveCount(0);
    await expect(page.getByText('nobody-by-this-name')).toHaveCount(0);
  });
});
