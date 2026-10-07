import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import accounts from '../fixtures/accounts.json';

export { accounts };

/** Flow specs need the seeded emulator stack; `npm run test:e2e:emulators` sets this. */
export function requireEmulators() {
  test.skip(process.env.E2E_EMULATORS !== '1', 'Run with npm run test:e2e:emulators');
}

export function seedState(): { playerId: string; scoutId: string } {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.seed-state.json'), 'utf8'));
}

export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** A first launch starts an anonymous guest session and lands on the guest Home. */
export async function openGuestHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 120_000 });
}

async function openGuestAccountActions(page: Page) {
  await openGuestHome(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'I already have an account' })).toBeVisible({
    timeout: 20_000,
  });
}

export async function signIn(page: Page, email: string, password = accounts.password) {
  await openGuestAccountActions(page);
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeHidden({ timeout: 30_000 });
}

/** New accounts must pick an age band before anything else; tests register adults. */
export async function passAgeGateAsAdult(page: Page) {
  const gate = page.getByTestId('youth-gate-age');
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await gate.getByRole('radio', { name: '18 or older' }).click();
  await gate.getByRole('button', { name: 'Continue' }).click();
  await expect(gate).toBeHidden({ timeout: 30_000 });
}

export async function openRegister(page: Page) {
  await openGuestAccountActions(page);
  await page.getByRole('button', { name: 'Create your account' }).click();
}
