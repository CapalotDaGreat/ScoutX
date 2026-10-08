import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { accounts, requireEmulators, signIn, trackPageErrors } from './helpers';

requireEmulators();
test.setTimeout(180_000);

const SOURCE_URL = 'https://www.fvrz.ch/de/e2e-team/42';

/** The provider is never contacted: any request to it is answered locally. */
async function stubProviders(context: BrowserContext) {
  await context.route(/^https:\/\/([a-z0-9-]+\.)*fvrz\.ch\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'stub' }),
  );
}

async function openSourcesSection(page: Page) {
  await page.goto('/player/home');
  const toggle = page.getByRole('button', { name: /^External football sources\./ });
  await expect(toggle).toBeVisible({ timeout: 60_000 });
  if (!(await page.getByTestId('football-sources-section').isVisible())) await toggle.click();
  await expect(page.getByTestId('football-sources-section')).toBeVisible();
}

async function enterLink(page: Page, url: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('football-source-url-input').fill(url);
  await dialog.getByTestId('football-source-continue').click();
  return dialog;
}

test.describe.serial('Player: external football source links', () => {
  test('unsupported and insecure links are refused; a supported link is added privately', async ({ page, context }) => {
    const errors = trackPageErrors(page);
    await stubProviders(context);
    await signIn(page, accounts.seededPlayer.email);
    await openSourcesSection(page);
    await page.getByTestId('football-source-add').click();

    let dialog = await enterLink(page, 'https://example.com/league');
    await expect(dialog.getByTestId('football-source-unsupported')).toBeVisible();
    await expect(dialog.getByText("This website isn't currently supported")).toBeVisible();
    await expect(dialog.getByTestId('football-source-add-confirm')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Back' }).click();

    dialog = await enterLink(page, 'http://www.fvrz.ch/de/e2e-team/42');
    await expect(dialog.getByText('Only secure links starting with https:// can be added.')).toBeVisible();

    dialog = await enterLink(page, 'https://fvrz.ch.attacker.example/team');
    await expect(dialog.getByTestId('football-source-unsupported')).toBeVisible();
    await dialog.getByRole('button', { name: 'Back' }).click();

    dialog = await enterLink(page, `${SOURCE_URL}/`);
    await expect(dialog.getByText('Football source found')).toBeVisible();
    await expect(dialog.getByTestId('football-source-add-confirm')).toBeDisabled();
    await dialog.getByTestId('football-source-type-team').click();
    await dialog.getByTestId('football-source-add-confirm').click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const card = page.getByTestId('football-source-card').filter({ hasText: 'www.fvrz.ch/de/e2e-team/42' });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('Link added by the player. PitchProof does not independently verify the information on this website.')).toBeVisible();
    await expect(card.getByTestId('football-source-visibility-private')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  });

  test('the same link cannot be added twice', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await openSourcesSection(page);
    await page.getByTestId('football-source-add').click();
    const dialog = await enterLink(page, 'https://FVRZ.ch/de/e2e-team/42#top');
    await dialog.getByTestId('football-source-type-league').click();
    await dialog.getByTestId('football-source-add-confirm').click();
    await expect(dialog.getByTestId('football-source-save-error')).toHaveText('This source has already been added.', { timeout: 30_000 });
  });

  test('opening a link hands it to the browser without loading it in the app', async ({ page, context }) => {
    await stubProviders(context);
    await signIn(page, accounts.seededPlayer.email);
    await openSourcesSection(page);
    const card = page.getByTestId('football-source-card').filter({ hasText: 'www.fvrz.ch/de/e2e-team/42' });
    const popup = context.waitForEvent('page');
    await card.getByTestId('football-source-open').click();
    expect((await popup).url()).toBe(SOURCE_URL);
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('a link shared on the Passport is shown to visitors with the disclaimer', async ({ page, browser }) => {
    await signIn(page, accounts.seededPlayer.email);
    await openSourcesSection(page);
    const card = page.getByTestId('football-source-card').filter({ hasText: 'www.fvrz.ch/de/e2e-team/42' });
    await card.getByTestId('football-source-visibility-passport').click();
    await expect(card.getByTestId('football-source-visibility-passport')).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });

    const visitorContext = await browser.newContext();
    await stubProviders(visitorContext);
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/player/${accounts.seededPlayer.username}`, { waitUntil: 'domcontentloaded' });
    await expect(visitor.getByText(accounts.seededPlayer.name).first()).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(
        async () => {
          await visitor.reload({ waitUntil: 'domcontentloaded' });
          await visitor.getByText(accounts.seededPlayer.name).first().waitFor({ timeout: 60_000 });
          return visitor.getByTestId('public-football-sources').count();
        },
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBeGreaterThan(0);
    const listed = visitor.getByTestId('public-football-sources');
    await expect(listed.getByText('www.fvrz.ch/de/e2e-team/42')).toBeVisible();
    await expect(listed.getByText('Link added by the player. PitchProof does not independently verify the information on this website.')).toBeVisible();
    await expect(listed.getByText('Added by player')).toBeVisible();
    await visitorContext.close();
  });

  test('the player removes the link', async ({ page }) => {
    await signIn(page, accounts.seededPlayer.email);
    await openSourcesSection(page);
    const card = page.getByTestId('football-source-card').filter({ hasText: 'www.fvrz.ch/de/e2e-team/42' });
    await card.getByTestId('football-source-remove').click();
    await expect(card.getByText('Remove this source?')).toBeVisible();
    await card.getByTestId('football-source-remove-confirm').click();
    await expect(card).toHaveCount(0, { timeout: 30_000 });
  });
});
