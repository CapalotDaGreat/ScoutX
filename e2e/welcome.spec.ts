import { expect, test } from '@playwright/test';
import { openGuestAccountActions, openGuestHome, openRegister } from './flows/helpers';

test.setTimeout(150_000);

test.describe('Guest entry and account access', () => {
  test('offers registration and sign-in from guest settings', async ({ page }) => {
    await openGuestAccountActions(page);

    await expect(page.getByRole('button', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'I already have an account' })).toBeVisible();
  });

  test('navigates to login screen', async ({ page }) => {
    await openGuestAccountActions(page);

    await page.getByRole('button', { name: 'I already have an account' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('navigates to register screen', async ({ page }) => {
    await openRegister(page);
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('has no uncaught page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await openGuestHome(page);
    expect(pageErrors).toEqual([]);
  });

  test('a fresh installation can browse without creating an account', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await openGuestHome(page);
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

test.describe('Public Football Passport', () => {
  test('an unknown slug does not invent a player profile', async ({ page }) => {
    await page.goto('/player/not-a-real-scoutx-slug', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Passport not found').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('not-a-real-scoutx-slug')).toHaveCount(0);
  });
});

