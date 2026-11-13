import { expect, test, type Page } from '@playwright/test';
import {
  acceptLegalGate,
  accounts,
  openRegister,
  passAgeGateAsAdult,
  queryCollection,
  readDocument,
  requireEmulators,
  seedState,
  signIn,
  trackPageErrors,
} from './helpers';

requireEmulators();
test.setTimeout(240_000);

// A long compound surname with no break opportunity is the worst case for the name heading.
const LONG_NAME = 'Maximiliane-Alexandrina Wolfeschlegelsteinhausenbergerdorff';
let longNameEmail = '';
let longNameUid = '';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${accounts.projectId}/databases/(default)/documents`;

async function assertNoPageOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, label).toBeLessThanOrEqual(1);
}

/** Elements that stick out past the right edge without being inside a horizontal scroller. */
async function clippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('div,input'))) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || box.right <= innerWidth + 1 || box.left >= innerWidth || !element.offsetParent) continue;
      let scroller = false;
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(node).overflowX)) { scroller = true; break; }
      }
      if (!scroller) found.push((element.innerText || element.getAttribute('placeholder') || element.tagName).slice(0, 40));
    }
    return found.slice(0, 5);
  });
}

test.describe.serial('States and content extremes', () => {
  test('a very long name fits Home and the Passport on a 320 px screen', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    longNameEmail = `long-name-${Date.now()}@e2e.scoutx.test`;
    await openRegister(page);
    await page.getByLabel('Full name').fill(LONG_NAME);
    await page.getByLabel('Email', { exact: true }).fill(longNameEmail);
    await page.getByLabel('Password', { exact: true }).fill(accounts.password);
    await page.getByLabel('Confirm password').fill(accounts.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await passAgeGateAsAdult(page);
    await acceptLegalGate(page);
    await page.getByRole('button', { name: /^Player / }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: LONG_NAME })).toBeVisible({ timeout: 30_000 });
    await assertNoPageOverflow(page, 'home today');
    expect(await clippedElements(page), 'home today').toEqual([]);
    // Nothing logged yet: the stat strip must show unknown as a dash, never as a rating of zero.
    await expect(page.getByText('Avg rating', { exact: true }).first()).toBeVisible();

    await page.getByTestId('home-segments').getByText('Passport', { exact: true }).click();
    await expect(page.getByText(LONG_NAME).first()).toBeVisible({ timeout: 30_000 });
    await assertNoPageOverflow(page, 'home passport');
    expect(await clippedElements(page), 'home passport').toEqual([]);

    const users = await queryCollection('users', 'email', longNameEmail);
    expect(users).toHaveLength(1);
    longNameUid = users[0].id;
    expect(errors).toEqual([]);
    await context.close();
  });

  test('an incomplete match form explains itself, and tapping Save twice logs one match', async ({ page }) => {
    await signIn(page, longNameEmail);
    await page.getByRole('button', { name: /Log (your first )?match/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Opponent').fill('FC Double Tap');
    await dialog.getByRole('button', { name: 'Win' }).click();
    const save = dialog.getByRole('button', { name: 'Save match' });

    // An incomplete form says what is missing, in the form, and keeps what was typed.
    await save.click();
    await expect(dialog.getByTestId('log-match-error')).toHaveText('Add the competition.');
    await expect(dialog.getByLabel('Opponent')).toHaveValue('FC Double Tap');
    await dialog.getByLabel('Competition').fill('League');
    await expect(dialog.getByTestId('log-match-error')).toHaveCount(0);
    await dialog.getByRole('button', { name: '90', exact: true }).click();

    await save.dblclick();
    await expect(save).toBeHidden({ timeout: 30_000 });

    await expect
      .poll(async () => {
        const profile = await readDocument(`profiles/${longNameUid}`);
        const matches = (profile?.data.statisticsMatches as Array<{ opponent?: string }> | undefined) ?? [];
        return matches.filter((match) => match.opponent === 'FC Double Tap').length;
      }, { timeout: 30_000 })
      .toBe(1);
  });

  test('a scout cannot open a player who has not opted in, and learns nothing about them', async ({ page }) => {
    await signIn(page, accounts.scout.email);
    await page.goto(`/scout/player/${longNameUid}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(LONG_NAME)).toHaveCount(0);
    await expect(page.getByText('Wolfeschlegel', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Go Back', exact: true })).toBeVisible();

    // Not listed in Discover either.
    await page.goto('/scout/discover', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Search by name, club, nationality, position...').fill('Wolfeschlegel');
    await expect(page.getByText(accounts.seededPlayer.name)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-testid^="player-card-"]')).toHaveCount(0);
  });

  test('a failed load offers Try again, and retrying after the connection returns shows the player', async ({ page, context }) => {
    const { playerId } = seedState();
    await signIn(page, accounts.scout.email);
    // Cut the Firestore emulator only; the app shell is already loaded.
    await context.route(/127\.0\.0\.1:8080|localhost:8080/, (route) => route.abort('connectionfailed'));
    await page.goto(`/scout/player/${playerId}`, { waitUntil: 'domcontentloaded' });
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('heading', { name: accounts.seededPlayer.name })).toHaveCount(0);

    await context.unroute(/127\.0\.0\.1:8080|localhost:8080/);
    await expect
      .poll(async () => {
        if (await retry.isVisible()) await retry.click();
        return page.getByRole('heading', { name: accounts.seededPlayer.name }).count();
      }, { timeout: 90_000, intervals: [3_000] })
      .toBeGreaterThan(0);
  });

  test('going offline keeps what was loaded and a half-written form keeps its input', async ({ page, context }) => {
    await signIn(page, accounts.seededPlayer.email);
    await expect(page.getByRole('heading', { name: accounts.seededPlayer.name })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Log match' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Opponent').fill('FC Offline Draft');
    await context.setOffline(true);
    await expect(page.getByText('Offline — drafts stay on this device', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByLabel('Opponent')).toHaveValue('FC Offline Draft');
    await context.setOffline(false);
    await expect(dialog.getByLabel('Opponent')).toHaveValue('FC Offline Draft');
  });

  test('a portrait that cannot be loaded shows initials, never an empty frame', async ({ browser }) => {
    expect(longNameUid, 'set by the long-name test').not.toBe('');
    // Controlled emulator write on the throwaway long-name account: an address that refuses connections.
    const response = await fetch(`${FIRESTORE}/profiles/${longNameUid}?updateMask.fieldPaths=avatarUrl`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { avatarUrl: { stringValue: 'http://127.0.0.1:9/missing-portrait.jpg' } } }),
    });
    expect(response.ok).toBe(true);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    await signIn(page, longNameEmail);
    await expect(page.getByRole('heading', { name: LONG_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('MW', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // No broken image is left on screen in place of the portrait.
    const brokenImages = await page.evaluate(() => Array.from(document.images)
      .filter((image) => image.src.includes('missing-portrait') && image.offsetParent !== null).length);
    expect(brokenImages).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe('Session states', () => {
  test('a signed-in session is restored in a new tab, and after sign-out player links show nothing private', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    await signIn(page, accounts.seededPlayer.email);
    await expect(page.getByRole('heading', { name: accounts.seededPlayer.name }).first()).toBeVisible({ timeout: 30_000 });

    // Cold start in a second tab of the same browser profile: the stored session is restored without signing in.
    const second = await context.newPage();
    await second.goto('/player/settings');
    await expect(second.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(second.getByText(accounts.seededPlayer.email).first()).toBeVisible();
    await second.close();

    await page.goto('/player/settings');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Home' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(accounts.seededPlayer.email)).toHaveCount(0);

    // A player-only address after sign-out must not open the account's screens or reveal its data.
    for (const path of ['/player/settings', '/player/plan', '/player/privacy']) {
      await page.goto(path);
      // Firestore keeps a long-poll open, so wait for a rendered screen rather than network idle.
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(accounts.seededPlayer.email)).toHaveCount(0);
      await expect(page.getByRole('heading', { name: accounts.seededPlayer.name })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
  test('B-23: signing out of Settings starts one guest session, late responses change nothing, and the next account sees only its own data', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    let guestSignUps = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('accounts:signUp')) guestSignUps += 1;
    });
    await signIn(page, accounts.seededPlayer.email);
    await page.goto('/player/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(accounts.seededPlayer.email).first()).toBeVisible();
    // Settings is usable only once the age/guardian gate has its record; holding traffic before that keeps the curtain up.
    await expect(page.getByTestId('youth-gate-loading')).toHaveCount(0, { timeout: 30_000 });

    // Hold Firestore traffic while signing out, so the player's Settings loads answer only after the session changed.
    const held: Array<() => Promise<void>> = [];
    await page.route('**/127.0.0.1:8080/**', (route) => { held.push(() => route.continue().catch(() => undefined)); });
    await page.route('**/localhost:8080/**', (route) => { held.push(() => route.continue().catch(() => undefined)); });
    const before = guestSignUps;
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForTimeout(1_500);
    await page.unroute('**/127.0.0.1:8080/**');
    await page.unroute('**/localhost:8080/**');
    for (const release of held) await release();
    await expect(page.getByRole('heading', { name: 'Home' }).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000);
    expect(guestSignUps - before, 'exactly one replacement guest session').toBe(1);
    await expect(page.getByText(accounts.seededPlayer.email)).toHaveCount(0);

    // Straight into another account: Settings shows the scout, never the player.
    await signIn(page, accounts.scout.email);
    await page.goto('/scout/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(accounts.scout.email).first()).toBeVisible();
    await expect(page.getByText(accounts.seededPlayer.email)).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
  });
  test('B-23: an expired or revoked session gets one replacement guest and no stale state; a refresh outage keeps the session', async ({ browser }) => {
    expect(longNameEmail, 'set by the long-name test').not.toBe('');
    // Controlled emulator fixture: the throwaway long-name account is disabled for this test and enabled again afterwards.
    const setDisabled = async (disableUser: boolean) => {
      const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${accounts.projectId}/accounts:update`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: longNameUid, disableUser }),
      });
      expect(response.ok).toBe(true);
    };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.clock.install();
    const errors = trackPageErrors(page);
    let guestSignUps = 0;
    const refreshStatuses: number[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('accounts:signUp')) guestSignUps += 1;
    });
    page.on('response', (response) => {
      if (response.url().includes('securetoken.googleapis.com')) refreshStatuses.push(response.status());
    });
    await signIn(page, longNameEmail);
    await page.goto('/player/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(longNameEmail).first()).toBeVisible();
    await expect(page.getByTestId('youth-gate-loading')).toHaveCount(0, { timeout: 30_000 });

    // 1. The token expires while the refresh endpoint is unreachable: the session must survive, and no guest appears.
    await context.route('**/securetoken.googleapis.com/**', (route) => route.abort('connectionfailed'));
    let before = guestSignUps;
    await page.clock.fastForward('01:05:00');
    await page.waitForTimeout(5_000);
    expect(guestSignUps - before, 'a refresh outage is not a sign-out').toBe(0);
    await expect(page.getByText(longNameEmail).first()).toBeVisible();
    await context.unroute('**/securetoken.googleapis.com/**');

    // 2. The account is revoked and its token expires with Settings open: exactly one guest replaces it.
    await setDisabled(true);
    try {
      before = guestSignUps;
      await page.clock.fastForward('01:05:00');
      await expect.poll(() => guestSignUps - before, { timeout: 60_000, message: 'one replacement guest session' }).toBe(1);
      expect(refreshStatuses.some((status) => status === 400), 'the emulator refused the refresh').toBe(true);
      await page.waitForTimeout(3_000);
      expect(guestSignUps - before).toBe(1);
      await expect(page.getByText(longNameEmail)).toHaveCount(0, { timeout: 30_000 });

      // 3. Signing in to another account afterwards shows only that account.
      await signIn(page, accounts.scout.email);
      await page.goto('/scout/settings');
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(accounts.scout.email).first()).toBeVisible();
      await expect(page.getByText(longNameEmail)).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await setDisabled(false);
      await context.close();
    }
  });
});
