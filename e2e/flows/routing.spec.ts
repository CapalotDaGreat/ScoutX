import { expect, test, type Page } from '@playwright/test';
import { accounts, openGuestHome, requireEmulators, signIn, trackPageErrors } from './helpers';

requireEmulators();
test.setTimeout(180_000);

/**
 * Direct links and Back. On web the router reads the address bar itself, so the role and auth
 * gate in `deepLinkResolver` (used for native links and push taps) is covered by its unit suite;
 * these tests cover what a web address or a restored session actually renders.
 */
async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

test.describe('Player direct links', () => {
  test('Plan and usage opens from a link, survives a reload, and Back leads home', async ({ page }) => {
    const errors = trackPageErrors(page);
    await signIn(page, accounts.seededPlayer.email);
    await open(page, '/player/plan');
    await expect(page.getByRole('heading', { name: 'Plan & usage' })).toBeVisible({ timeout: 60_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Plan & usage' })).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/player\/plan$/);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/player\/home$/);
    expect(errors).toEqual([]);
  });

  test('Privacy Center opens from a link and from Settings, and Back returns each time', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await open(page, '/player/privacy');
    await expect(page.getByTestId('privacy-center-consents')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
    // The privacy switches load above this button and push it down; wait for them so the tap lands on it.
    await expect(page.getByText('Social feed visibility').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('settings-open-privacy-center').click();
    await expect(page.getByTestId('privacy-center-consents')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('settings-open-privacy-center')).toBeVisible({ timeout: 30_000 });
  });

  test('a missing match report explains itself and offers a way back, never a silent Home', async ({ page }) => {
    const errors = trackPageErrors(page);
    await signIn(page, accounts.seededPlayer.email);
    await open(page, '/match/doesNotExist123');
    await expect(page.getByRole('heading', { name: 'No longer available' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('This item was removed or you no longer have access to it.', { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/match\/doesNotExist123$/);
    // No report content, statistics or coaching may render for a report that could not be read.
    await expect(page.getByText(/confirmed moment|What to work on|Best moments/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Back', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('every pushed player screen opened from a link has a working Back', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    for (const path of ['/player/settings', '/player/trials', '/player/requests', '/player/search']) {
      await open(page, path);
      const back = page.getByRole('button', { name: 'Back', exact: true }).first();
      await expect(back, path).toBeVisible({ timeout: 60_000 });
      await back.click();
      await expect(page, path).toHaveURL(/\/player\/home$/, { timeout: 30_000 });
    }
  });
});

test.describe('Scout direct links', () => {
  test('Privacy Center opens from a link and Back leads to the dashboard', async ({ page }) => {
    await signIn(page, accounts.scout.email);
    await open(page, '/scout/privacy');
    await expect(page.getByTestId('privacy-center-consents')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/scout$/, { timeout: 30_000 });
  });

  test('a missing player shows an error with retry and a way back', async ({ page }) => {
    await signIn(page, accounts.scout.email);
    await open(page, '/scout/player/doesNotExist123');
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await page.getByRole('button', { name: 'Go Back', exact: true }).click();
    await expect(page).toHaveURL(/\/scout$/, { timeout: 30_000 });
  });

  test('player-only addresses do not open player screens for a scout', async ({ page }) => {
    await signIn(page, accounts.scout.email);
    for (const path of ['/player/plan', '/player/privacy', '/match/doesNotExist123']) {
      await open(page, path);
      await expect(page.getByRole('tab', { name: 'Pipeline' }), path).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('heading', { name: 'Plan & usage' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Match analysis' })).toHaveCount(0);
    }
  });
});

test.describe('Guest direct links', () => {
  test('an unknown Passport address says so and offers a way back', async ({ page }) => {
    await open(page, '/player/no-such-passport-slug');
    await expect(page.getByRole('heading', { name: 'Passport not found' })).toBeVisible({ timeout: 120_000 });
    // A visitor's home is the public Discover list.
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Discover Players' })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/guest$/);
  });

  test('the link-unavailable screen names the reason and leads home', async ({ page }) => {
    await open(page, '/link/unavailable?reason=private');
    await expect(page.getByRole('heading', { name: 'This item is private' })).toBeVisible({ timeout: 120_000 });
    // The screen is replaced as soon as the press lands, so do not wait on the detached button.
    await page.getByRole('button', { name: 'Go to home' }).dispatchEvent('click');
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 60_000 });
  });

  test('an unknown address falls back to the guest Home without errors', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openGuestHome(page);
    await open(page, '/nope/unknown');
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 60_000 });
    expect(errors).toEqual([]);
  });
});
