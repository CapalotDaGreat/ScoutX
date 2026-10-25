import { expect, test, type Page } from '@playwright/test';
import { accounts, requireEmulators, seedState, signIn, trackPageErrors } from './helpers';

requireEmulators();
test.setTimeout(180_000);

const fixture = Buffer.from(`<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
<trkpt lat="47" lon="8"><time>2026-01-01T12:00:00Z</time></trkpt>
<trkpt lat="47.00004" lon="8"><time>2026-01-01T12:00:01Z</time></trkpt>
<trkpt lat="47.00008" lon="8"><time>2026-01-01T12:00:02Z</time></trkpt>
<trkpt lat="47.00012" lon="8"><time>2026-01-01T12:00:03Z</time></trkpt>
</trkseg></trk></gpx>`);

async function selectFile(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose GPX, TCX or sample CSV', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-training.gpx', mimeType: 'application/gpx+xml', buffer: fixture });
  await expect(page.getByLabel('Local session label')).toBeVisible();
}

test('wearable import confirms locally, survives reload, strips locations and deletes', async ({ page }) => {
  const errors = trackPageErrors(page);
  const key = `gps/local-import/${encodeURIComponent(seedState().playerId)}`;
  await signIn(page, accounts.seededPlayer.email);
  await page.getByRole('tab', { name: 'Media', exact: true }).click();
  await page.getByTestId('player-media-segments').getByText('GPS', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wearable import', exact: true })).toBeVisible();
  await selectFile(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
  await selectFile(page);
  await page.getByLabel('Local session label').fill('E2E local wearable');
  await page.getByRole('button', { name: 'Save local summary', exact: true }).click();
  await expect(page.getByText('E2E local wearable', { exact: true })).toBeVisible();
  const stored = await page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
  expect(stored).toBeTruthy();
  expect(stored).not.toMatch(/latitude|longitude|2026-01-01|synthetic-training|<gpx/);
  const data = JSON.parse(stored ?? '{}') as { metrics: { distanceM: number }; importProvenance: { source: string } };
  expect(data.metrics.distanceM).toBeGreaterThan(0);
  expect(data.importProvenance.source).toBe('wearable_file');
  await page.screenshot({ path: `.local/intelligence-v2-visual/gps-import-${test.info().project.name}.png`, fullPage: false });
  await page.reload();
  await page.getByTestId('player-media-segments').getByText('GPS', { exact: true }).click();
  await expect(page.getByText('E2E local wearable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete local import', exact: true }).click();
  await expect(page.getByText('E2E local wearable', { exact: true })).toBeHidden();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
  expect(errors).toEqual([]);
});
