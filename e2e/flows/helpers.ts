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

/** New accounts accept the required legal documents once, after the age gate. */
export async function acceptLegalGate(page: Page) {
  const gate = page.getByTestId('legal-gate');
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await gate.getByTestId('legal-gate-agree').click();
  await gate.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(gate).toBeHidden({ timeout: 30_000 });
}

export async function openRegister(page: Page) {
  await openGuestAccountActions(page);
  await page.getByRole('button', { name: 'Create your account' }).click();
}

/** Registers a fresh email/password account and stops at the age gate. Returns the email. */
export async function registerAccount(page: Page, name: string, prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}@e2e.scoutx.test`;
  await openRegister(page);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(accounts.password);
  await page.getByLabel('Confirm password').fill(accounts.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('youth-gate-age')).toBeVisible({ timeout: 30_000 });
  return email;
}

// Emulator REST access for assertions. "Bearer owner" bypasses rules and only works on the emulator.
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${accounts.projectId}/databases/(default)/documents`;
const FUNCTIONS = `http://127.0.0.1:5001/${accounts.projectId}/us-central1`;

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

function decode(value: FirestoreValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode);
  if (value.mapValue) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

export type EmulatorDoc = { id: string; data: Record<string, unknown> };

export async function queryCollection(
  collection: string,
  field: string,
  value: string,
  op: 'EQUAL' | 'ARRAY_CONTAINS' = 'EQUAL',
): Promise<EmulatorDoc[]> {
  const response = await fetch(`${FIRESTORE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: value } } },
      },
    }),
  });
  const rows = (await response.json()) as Array<{ document?: { name: string; fields?: Record<string, FirestoreValue> } }>;
  return rows
    .filter((row) => row.document)
    .map((row) => ({ id: row.document!.name.split('/').pop()!, data: decodeFields(row.document!.fields ?? {}) }));
}

export async function documentExists(path: string): Promise<boolean> {
  const response = await fetch(`${FIRESTORE}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  return response.status === 200;
}

/** Calls a callable like the guardian web page does (no app account). */
export async function callFunction<T>(name: string, data: unknown): Promise<T> {
  const response = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = (await response.json()) as { result?: T; error?: { message: string } };
  if (!response.ok || body.error) throw new Error(`${name} failed: ${body.error?.message ?? response.status}`);
  return body.result as T;
}

/** Waits for the guardian email queued for this address and returns the token in its link. */
export async function guardianTokenFor(guardianEmail: string, purpose = 'guardian_consent'): Promise<{ token: string; uid: string }> {
  let found: EmulatorDoc | undefined;
  await expect
    .poll(
      async () => {
        const docs = await queryCollection('mail', 'to', guardianEmail, 'ARRAY_CONTAINS');
        found = docs.find((doc) => doc.data.purpose === purpose);
        return Boolean(found);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const text = String((found!.data.message as { text?: unknown }).text ?? '');
  const match = /\/guardian\/\?t=([A-Za-z0-9._%-]+)/.exec(text);
  if (!match) throw new Error('guardian mail has no link');
  return { token: decodeURIComponent(match[1]), uid: String(found!.data.scoutxUid) };
}
