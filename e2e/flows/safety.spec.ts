import { expect, test } from '@playwright/test';
import {
  acceptLegalGate,
  accounts,
  callFunction,
  documentExists,
  guardianTokenFor,
  queryCollection,
  registerAccount,
  requireEmulators,
  seedState,
  signIn,
  trackPageErrors,
} from './helpers';

requireEmulators();
test.setTimeout(180_000);

async function chooseTeenBand(page: import('@playwright/test').Page) {
  const gate = page.getByTestId('youth-gate-age');
  await gate.getByRole('radio', { name: '13 to 17' }).click();
  await gate.getByRole('checkbox').click();
  await gate.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('youth-gate-guardian')).toBeVisible({ timeout: 30_000 });
}

async function askGuardian(page: import('@playwright/test').Page, guardianEmail: string) {
  const step = page.getByTestId('youth-gate-guardian');
  await step.getByLabel('Parent or guardian email').fill(guardianEmail);
  await step.getByRole('button', { name: 'Send approval email' }).click();
  await expect(page.getByTestId('youth-gate-waiting')).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('Youth safety, reporting, privacy and plan', () => {
  test('a 13-17 player waits for a guardian; approving the mailed link unlocks the app', async ({ page }) => {
    const errors = trackPageErrors(page);
    await registerAccount(page, 'Mia Youth', 'teen');
    await chooseTeenBand(page);
    const guardianEmail = `guardian-${Date.now()}@e2e.scoutx.test`;
    await askGuardian(page, guardianEmail);
    await expect(page.getByTestId('legal-gate')).toBeHidden();

    const { token, uid } = await guardianTokenFor(guardianEmail);
    const view = await callFunction<{ purpose: string; playerFirstName: string }>('getGuardianConsentRequest', { token });
    expect(view).toMatchObject({ purpose: 'consent', playerFirstName: 'Mia' });
    await callFunction('respondGuardianConsent', {
      token,
      decision: 'approve',
      scopes: ['public_passport'],
      confirmGuardian: true,
    });

    await expect(page.getByTestId('youth-gate-waiting')).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId('legal-gate')).toBeVisible({ timeout: 30_000 });
    const [safety] = await queryCollection('youthConsents', 'uid', uid);
    expect(safety.data.status).toBe('approved');
    expect(safety.data.scopes).toEqual(['public_passport']);
    expect(errors).toEqual([]);
  });

  test('a waiting 13-17 player can delete their account without the guardian', async ({ page }) => {
    await registerAccount(page, 'Leo Leaving', 'teen-delete');
    await chooseTeenBand(page);
    const guardianEmail = `guardian-del-${Date.now()}@e2e.scoutx.test`;
    await askGuardian(page, guardianEmail);
    const { uid } = await guardianTokenFor(guardianEmail);
    expect(await documentExists(`userSafety/${uid}`)).toBe(true);

    await page.getByTestId('youth-gate-waiting').getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('youth-gate-waiting')).toBeHidden({ timeout: 60_000 });
    await expect.poll(() => documentExists(`userSafety/${uid}`), { timeout: 60_000 }).toBe(false);
    await expect.poll(() => documentExists(`users/${uid}`), { timeout: 60_000 }).toBe(false);
    await expect.poll(async () => (await queryCollection('mail', 'scoutxUid', uid)).length, { timeout: 60_000 }).toBe(0);
    await expect.poll(async () => (await queryCollection('youthConsents', 'uid', uid)).length, { timeout: 60_000 }).toBe(0);
    await expect.poll(() => documentExists(`guardianContacts/${uid}`), { timeout: 60_000 }).toBe(false);
  });

  test('an under-13 player stays locked until a parent signs and confirms, then uses a private account', async ({ page }) => {
    const errors = trackPageErrors(page);
    await registerAccount(page, 'Noah Junior', 'child');
    const gate = page.getByTestId('youth-gate-age');
    await gate.getByRole('radio', { name: 'Under 13' }).click();
    await expect(page.getByTestId('age-under13-notice')).toBeVisible();
    await gate.getByRole('checkbox').click();
    await gate.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('youth-gate-guardian')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('youth-gate-child-deadline')).toBeVisible({ timeout: 30_000 });

    const guardianEmail = `parent-${Date.now()}@e2e.scoutx.test`;
    await page.getByTestId('guardian-email').fill(guardianEmail);
    await page.getByTestId('guardian-send').click();
    await expect(page.getByTestId('youth-gate-waiting')).toBeVisible({ timeout: 30_000 });

    const { token, uid } = await guardianTokenFor(guardianEmail);
    const view = await callFunction<{ child: boolean; scopes: string[] }>('getGuardianConsentRequest', { token });
    expect(view).toMatchObject({ child: true, scopes: ['ai_analysis'] });
    await callFunction('respondGuardianConsent', {
      token,
      decision: 'approve',
      scopes: ['ai_analysis', 'discovery'],
      confirmGuardian: true,
      acknowledged: true,
      signature: 'Anna Junior',
    });
    await expect(page.getByTestId('youth-gate-waiting')).toBeVisible();

    const confirm = await guardianTokenFor(guardianEmail, 'guardian_child_confirm');
    await callFunction('respondGuardianConsent', { token: confirm.token, decision: 'confirm' });
    await expect(page.getByTestId('youth-gate-waiting')).toBeHidden({ timeout: 30_000 });
    const [consent] = await queryCollection('youthConsents', 'uid', uid);
    expect(consent.data.status).toBe('approved');
    expect(consent.data.scopes).toEqual(['ai_analysis']);

    await acceptLegalGate(page);
    await expect(page.getByRole('heading', { name: 'Choose your role' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Scout / })).toHaveCount(0);
    await page.getByRole('button', { name: /^Player / }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('private-mode-card')).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('a scout reports a Passport video with "I appear in this video"', async ({ page }) => {
    const { playerId } = seedState();
    await signIn(page, accounts.scout.email);
    await page.goto(`/scout/player/${playerId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('report-passport-video').click({ timeout: 60_000 });

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Report content')).toBeVisible();
    await dialog.getByRole('radio', { name: 'I appear in this video' }).click();
    await dialog.getByLabel('Details').fill('E2E: this is me in the second half clip.');
    await dialog.getByRole('button', { name: 'Submit report' }).click();
    await expect(dialog.getByRole('button', { name: 'Submit report' })).toBeHidden({ timeout: 30_000 });

    await expect
      .poll(
        async () =>
          (await queryCollection('contentReports', 'targetId', playerId)).filter(
            (doc) => doc.data.reason === 'appears_in_video' && doc.data.targetType === 'passport',
          ).length,
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  });

  test('the Privacy Center records a privacy request and starts a data export', async ({ page }) => {
    const { playerId } = seedState();
    await signIn(page, accounts.seededPlayer.email);
    await page.goto('/player/settings');
    await page.getByTestId('settings-open-privacy-center').click();
    await expect(page.getByTestId('privacy-center')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('privacy-center-consents')).toBeVisible();

    await page.getByTestId('privacy-request-type-objection').click();
    await page.getByTestId('privacy-request-details').fill('E2E: object to scout discovery.');
    await page.getByTestId('privacy-request-submit').click();
    await expect
      .poll(async () => (await queryCollection('privacyRequests', 'uid', playerId)).map((doc) => doc.data.type), {
        timeout: 30_000,
      })
      .toContain('objection');
    await expect(page.locator('[data-testid^="privacy-request-"]').filter({ hasText: 'Objection' }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId('data-export-request').click();
    await expect
      .poll(async () => (await queryCollection('dataExports', 'uid', playerId)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
  });

  test('Plan & usage shows the free allowance and what is always free', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await page.goto('/player/settings');
    await page.getByTestId('settings-open-plan').click();
    await expect(page.getByText('Free plan').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Clip analyses').first()).toBeVisible();
    await expect(page.getByText('Always free').first()).toBeVisible();
    await expect(page.getByText('Safety tools, blocking and reporting').first()).toBeVisible();
  });
});
