import { expect, test, type Page } from '@playwright/test';

async function waitForAppReady(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('button', { name: 'Create your account' })).toBeVisible({
    timeout: 90_000,
  });
}

test.describe('Welcome screen', () => {
  test('renders primary auth actions', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.getByText('ScoutX', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'I already have an account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue as Guest' })).toBeVisible();
  });

  test('navigates to login screen', async ({ page }) => {
    await waitForAppReady(page);

    await page.getByRole('button', { name: 'I already have an account' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('navigates to register screen', async ({ page }) => {
    await waitForAppReady(page);

    await page.getByRole('button', { name: 'Create your account' }).click();
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

    await waitForAppReady(page);
    expect(pageErrors).toEqual([]);
  });

  test('guest continue reaches the guest shell without crashing', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await waitForAppReady(page);
    await page.getByRole('button', { name: 'Continue as Guest' }).click();
    await expect(page.getByRole('button', { name: 'Create your account' })).toBeHidden({
      timeout: 20_000,
    });
    expect(pageErrors).toEqual([]);
  });
});

test.describe('Public Football Passport', () => {
  test('an unknown slug does not invent a player profile', async ({ page }) => {
    await page.goto('/player/not-a-real-scoutx-slug', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Home').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('not-a-real-scoutx-slug')).toHaveCount(0);
  });
});

