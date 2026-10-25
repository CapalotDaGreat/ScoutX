import path from 'node:path';
import { expect, test } from '@playwright/test';
import { LEGAL_DOCUMENTS } from '../../src/features/legal/content.generated';
import {
  acceptLegalGate,
  accounts,
  openRegister,
  passAgeGateAsAdult,
  requireEmulators,
  readDocument,
  seedState,
  signIn,
  trackPageErrors,
} from './helpers';

requireEmulators();
test.setTimeout(180_000);

test.describe.serial('Player: register, log, goal, Passport, media', () => {
  test('a guest registers as a player and lands in the player app', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openRegister(page);
    await page.getByLabel('Full name').fill(accounts.newPlayer.name);
    await page
      .getByLabel('Email', { exact: true })
      .fill(`${accounts.newPlayer.emailPrefix}-${Date.now()}@e2e.scoutx.test`);
    await page.getByLabel('Password', { exact: true }).fill(accounts.password);
    await page.getByLabel('Confirm password').fill(accounts.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await passAgeGateAsAdult(page);
    await acceptLegalGate(page);
    await expect(page.getByRole('heading', { name: 'Choose your role' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Player / }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: accounts.newPlayer.name })).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('the seeded player logs a match and sees it in their history', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await page.getByRole('button', { name: 'Log match' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Log match' })).toBeVisible();
    await dialog.getByLabel('Opponent').fill('FC E2E Rivals');
    await dialog.getByRole('button', { name: 'Win' }).click();
    await dialog.getByLabel('Goals').fill('2');
    await dialog.getByRole('button', { name: 'Save match' }).click();

    await expect(dialog.getByRole('button', { name: 'Save match' })).toBeHidden({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.goto('/player/home');
    await expect(page.getByText('FC E2E Rivals').first()).toBeVisible({ timeout: 30_000 });
  });

  test('the seeded player sets a development goal', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await page.goto('/player/performance?segment=development');
    await page.getByRole('button', { name: 'New goal' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('What are you working on?').fill('Score from outside the box');
    await dialog.getByRole('button', { name: 'Technical' }).click();
    await dialog.getByRole('button', { name: 'Goals / match' }).click();
    await dialog.getByLabel('Target value').fill('1');
    await dialog.getByRole('button', { name: 'Save goal' }).click();

    await expect(dialog.getByRole('button', { name: 'Save goal' })).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText('Score from outside the box').first()).toBeVisible({ timeout: 30_000 });
  });

  test('the public Passport reflects the newly logged match', async ({ browser }) => {
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/player/${accounts.seededPlayer.username}`, { waitUntil: 'domcontentloaded' });
    await expect(visitor.getByText(accounts.seededPlayer.name).first()).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(
        async () => {
          await visitor.reload({ waitUntil: 'domcontentloaded' });
          await visitor.getByText(accounts.seededPlayer.name).first().waitFor({ timeout: 60_000 });
          return visitor.getByText('FC E2E Rivals').count();
        },
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBeGreaterThan(0);
  });

  test('the seeded player uploads a clip to the media library', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await page.getByRole('tab', { name: 'Media' }).click();

    await page.getByRole('button', { name: 'Upload from Photos' }).click();
    const sheet = page.getByRole('dialog');

    const acknowledgement = sheet.getByTestId('upload-acknowledgement');
    await expect(acknowledgement).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByTestId('upload-acknowledgement-accept')).toBeDisabled();
    for (const item of ['recordedOrPermission', 'peopleKnow', 'otherMinors', 'noPrivatePlaces', 'privateByDefault']) {
      await sheet.getByTestId(`upload-acknowledgement-${item}`).click();
    }
    await sheet.getByTestId('upload-acknowledgement-accept').click();
    await expect(acknowledgement).toBeHidden({ timeout: 30_000 });

    const chooser = page.waitForEvent('filechooser', { timeout: 20_000 });
    await sheet.getByRole('button', { name: 'Upload from Photos' }).click();
    await (await chooser).setFiles(path.join(__dirname, '..', 'fixtures', 'clip.mp4'));
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('heading', { name: 'Add Highlight Video' })).toBeVisible({ timeout: 30_000 });
    await editor.getByLabel('Title', { exact: true }).fill('E2E local highlight');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'E2E local highlight', exact: true })).toBeVisible({ timeout: 90_000 });
    const playerId = seedState().playerId;
    const uploadedVideo = async () => {
      const profile = await readDocument(`profiles/${playerId}`);
      const library = profile?.data.highlightVideos as { videos?: Array<{ id: string; title: string; uploadStatus: string; durationSec: number }> } | undefined;
      return library?.videos?.find((video) => video.title === 'E2E local highlight');
    };
    await expect.poll(async () => (await uploadedVideo())?.uploadStatus, { timeout: 90_000 }).toBe('ready');
    const uploaded = await uploadedVideo();
    if (!uploaded) throw new Error('Saved highlight was not found in the emulator');
    expect(uploaded.durationSec).toBeGreaterThan(0);
    const media = await readDocument(`players/${playerId}/media/${uploaded.id}`);
    expect(media?.data.uploadState).toBe('ready');
    expect(media?.data.visibility).toBe('private');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('Your library is empty for now.', { exact: false })).toBeHidden({ timeout: 90_000 });
  });

  test('the seeded player opens the Privacy Center and reads a bundled document', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await page.goto('/player/settings');
    await page.getByTestId('settings-open-privacy-center').click();
    await expect(page.getByTestId('privacy-center-consents')).toBeVisible({ timeout: 30_000 });
    const privacyVersion = LEGAL_DOCUMENTS.find((document) => document.id === 'privacy-policy')?.version;
    expect(privacyVersion).toBeTruthy();
    await expect(page.getByTestId('privacy-center-consents').getByText(`Version ${privacyVersion}`, { exact: false }).first()).toBeVisible();
    await page.getByTestId('privacy-center-documents').getByText('Youth Safety Policy').click();
    await expect(page.getByTestId('legal-document-youth-safety-policy')).toBeVisible();
  });
});
