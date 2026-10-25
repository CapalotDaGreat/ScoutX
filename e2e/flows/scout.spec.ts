import { expect, test, type Page } from '@playwright/test';
import { accounts, requireEmulators, signIn } from './helpers';

requireEmulators();
test.setTimeout(180_000);

async function openSeededPlayer(page: Page) {
  await page.getByRole('tab', { name: 'Discover' }).click();
  await page.getByRole('button', { name: new RegExp(`^${accounts.seededPlayer.name}`) }).click();
  await expect(page.getByRole('heading', { name: accounts.seededPlayer.name })).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('Scout: brief, discover, why, save, request, trial', () => {
  test('searches across public fields and opens the evidence profile from a readable card', async ({ page }, testInfo) => {
    await signIn(page, accounts.scout.email);
    await page.getByRole('tab', { name: 'Discover' }).click();
    await page.getByPlaceholder('Search by name, club, nationality, position...').fill('Lena E2E');
    const card = page.locator('[data-testid^="player-card-"]').filter({ hasText: accounts.seededPlayer.name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('Matches logged', { exact: true })).toBeVisible();
    await expect(card).not.toContainText(accounts.seededPlayer.privateBiographyMarker);
    await expect(card).not.toContainText(accounts.seededPlayer.phone);
    await page.screenshot({ path: `.local/discovery-${testInfo.project.name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await card.getByRole('button', { name: 'View player', exact: true }).click();
    await expect(page.getByRole('heading', { name: accounts.seededPlayer.name })).toBeVisible({ timeout: 30_000 });
  });

  test('saves a brief as a filter preset and discovers the seeded player', async ({ page }) => {
    await signIn(page, accounts.scout.email);
    await page.getByRole('tab', { name: 'Discover' }).click();

    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const sheet = page.getByRole('dialog');
    // Brief 2.0 requirement. On desktop web the sheet is taller than the viewport and keeps
    // settling, so pointer clicks miss; a DOM click still drives the Pressable.
    await expect(sheet.getByRole('heading', { name: 'Advanced Filters' })).toBeAttached({ timeout: 15_000 });
    await sheet.getByRole('button', { name: '30 days' }).dispatchEvent('click');
    await sheet.getByRole('button', { name: 'Apply Filters' }).dispatchEvent('click');
    await expect(sheet).toBeHidden({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Save filters', exact: true }).click();
    const save = page.getByRole('dialog');
    await save.getByLabel('Filter name').fill('Recent evidence brief');
    await save.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Recent evidence brief', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: new RegExp(`^${accounts.seededPlayer.name}`) })).toBeVisible();
  });

  test('explains the player from evidence and saves them to the pipeline', async ({ page }) => {
    await signIn(page, accounts.scout.email);
    await openSeededPlayer(page);

    await expect(page.getByText('Why this player').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Why you might wait' })).toBeVisible();
    await expect(page.getByText('Only 2 logged matches.', { exact: false }).or(page.getByText('logged match', { exact: false })).first()).toBeVisible();

    const save = page.getByRole('button', { name: 'Save', exact: true });
    if (await save.isVisible()) {
      await save.click();
    }
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.getByRole('tab', { name: 'Pipeline' }).click();
    await expect(page.getByText(accounts.seededPlayer.name).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('requests evidence and the player declines with the request closed for both', async ({ page, browser }) => {
    await signIn(page, accounts.scout.email);
    await openSeededPlayer(page);
    await page.getByRole('button', { name: 'Match log', exact: true }).click();
    await page.getByRole('textbox', { name: 'Optional note for the player' }).fill('Please log your next league match.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled({ timeout: 20_000 });

    const player = await (await browser.newContext()).newPage();
    await signIn(player, accounts.seededPlayer.email);
    await expect(player.getByText('Please log your next league match.').first()).toBeVisible({ timeout: 30_000 });
    await player.getByRole('button', { name: 'Decline' }).first().click();
    const confirm = player.getByRole('dialog');
    if (await confirm.count()) {
      await confirm.getByRole('button', { name: /Decline/ }).last().click();
    }
    await expect(player.getByText('Please log your next league match.')).toHaveCount(0, { timeout: 30_000 });
  });

  test('invites the player to a trial and the player accepts', async ({ page, browser }) => {
    await signIn(page, accounts.scout.email);
    await openSeededPlayer(page);
    await page.getByRole('button', { name: 'Invite to Trial' }).click();

    const form = page.getByRole('dialog');
    await form.getByLabel('Club').fill('FC E2E Academy');
    await form.getByLabel('Coach').fill('Kim Weber');
    await form.getByLabel('Location').fill('Pitch 2');
    await form.getByRole('button', { name: 'Send invitation' }).dispatchEvent('click');
    await expect(page.getByText('FC E2E Academy').first()).toBeVisible({ timeout: 30_000 });

    const player = await (await browser.newContext()).newPage();
    await signIn(player, accounts.seededPlayer.email);
    await player.goto('/player/trials');
    await expect(player.getByText('FC E2E Academy').first()).toBeVisible({ timeout: 30_000 });
    await player.getByText('FC E2E Academy').filter({ visible: true }).last().click();
    const response = player.getByRole('dialog');
    await response.getByRole('button', { name: 'Accept', exact: true }).dispatchEvent('click');
    await expect(response).toBeHidden({ timeout: 20_000 });
    await expect(player.getByText('Accepted', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  });
});
