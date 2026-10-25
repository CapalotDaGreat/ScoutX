import { expect, test } from '@playwright/test';
import { accounts, requireEmulators, seedState, signIn, trackPageErrors, readDocument } from './helpers';

requireEmulators();
test.skip(process.env.EXPO_PUBLIC_EXPERIMENTAL_TARGET_ANCHORS !== 'true', 'Explicit experimental UI gate required');
test.setTimeout(180_000);
const jobId = 'e2e-target-anchor';

function field(value: unknown): unknown {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, field(item)])) } };
  throw new Error('Unsupported fixture value');
}

test.beforeAll(async ({ request }) => {
  if (!accounts.projectId.startsWith('demo-')) throw new Error('Local demo fixtures only');
  const uid = seedState().playerId;
  const base = `http://127.0.0.1:8080/v1/projects/${accounts.projectId}/databases/(default)/documents`;
  const now = new Date().toISOString();
  const stats = Object.fromEntries(['minutesPlayed', 'goals', 'assists', 'shots', 'shotsOnTarget', 'passesAttempted', 'passesCompleted', 'passCompletionPct', 'tackles', 'duelsWon', 'matchRating', 'cleanSheet'].map((key) => [key, null]));
  const data = {
    id: jobId, playerId: uid, status: 'complete', pipelineState: 'completed', pipelineGeneration: 0,
    targeting: { jerseyNumber: '20', kitPrimaryColor: 'orange', kitSecondaryColor: 'white', position: 'CAM' },
    match: { opponent: 'Synthetic fixture', competition: 'Local test', date: '2026-10-23' },
    durationSec: 300, measuredDurationSec: 300, createdAt: now, updatedAt: now,
    videoStoragePath: `profiles/${uid}/matchFootage/${jobId}/video.mp4`,
    frames: [{ id: 'frame_1', index: 1, timestampSec: 242, source: 'server',
      storagePath: `profiles/${uid}/matchFootage/${jobId}/frames/frame_1.jpg`,
      downloadUrl: `${process.env.PLAYWRIGHT_BASE_URL}/__anchor-fixture.svg` }],
    report: { headline: 'Synthetic target-review fixture', methodology: 'UI fixture, not model evidence',
      strengths: [], improvements: [], coachingNotes: '', estimatedStats: stats, moments: [], evidence: [],
      pipelineStages: [], segments: [], availability: [], confidence: null, modelId: 'synthetic', generatedAt: now,
      coverage: { visiblePct: 0, likelyOffCameraPct: 0, unknownPct: 100, confidenceLabel: 'Limited', note: '' } },
  };
  for (const [path, payload] of [
    [`matchAnalysisJobs/${jobId}`, data],
    [`videoProcessingConsents/${jobId}`, { uid, jobId, policyVersion: '2026-10-video-v1', revokedAt: null }],
  ] as const) {
    const encoded = field(payload) as { mapValue: { fields: Record<string, unknown> } };
    const response = await request.patch(`${base}/${path}`, { headers: { Authorization: 'Bearer owner' }, data: { fields: encoded.mapValue.fields } });
    expect(response.ok()).toBeTruthy();
  }
});

test('target bounds save and remove without confirming a whole match', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.route('**/__anchor-fixture.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#187640"/><rect x="200" y="80" width="60" height="200" fill="#ef7820"/></svg>' }));
  await signIn(page, accounts.seededPlayer.email);
  await page.getByRole('button', { name: /^Latest analysis: Synthetic fixture/ }).click();
  await page.getByRole('button', { name: 'Open full report', exact: true }).click();
  const panel = page.getByTestId('target-anchor-panel');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByLabel('Left (%)')).toBeEditable({ timeout: 30_000 });
  const image = panel.getByRole('button', { name: 'Player image: select two opposite corners', exact: true });
  await image.scrollIntoViewIfNeeded();
  const imageBounds = await image.boundingBox();
  if (!imageBounds) throw new Error('Target image bounds missing');
  await image.click({ position: { x: imageBounds.width / 2 - 20, y: 60 } });
  await image.click({ position: { x: imageBounds.width / 2 + 20, y: 180 } });
  await expect(panel.getByLabel('Width (%)')).not.toHaveValue('');
  await panel.getByRole('button', { name: 'Reset selection', exact: true }).click();
  await panel.getByLabel('Left (%)').fill('30');
  await panel.getByLabel('Top (%)').fill('20');
  await panel.getByLabel('Width (%)').fill('12');
  await panel.getByLabel('Height (%)').fill('60');
  await panel.getByRole('button', { name: 'Save bounds', exact: true }).click();
  await expect(panel.getByText('Anchor at 242s', { exact: true })).toBeVisible({ timeout: 60_000 });
  const saved = await readDocument(`matchAnalysisJobs/${jobId}`);
  expect(saved?.data.pipelineGeneration).toBe(1);
  expect(saved?.data.identityConfirmation).toMatchObject({ state: 'pending' });
  await panel.getByTestId('target-anchor-coordinate').click();
  await expect(panel.getByTestId('target-anchor-coordinate-error')).toBeVisible({ timeout: 30_000 });
  expect((await readDocument(`matchAnalysisJobs/${jobId}`))?.data.identityConfirmation).toMatchObject({ state: 'pending' });
  await panel.screenshot({ path: `.local/target-anchor-${test.info().project.name}.png` });
  await page.reload();
  await expect.poll(async () => (await panel.isVisible()) || (await page.getByRole('button', { name: /^Latest analysis: Synthetic fixture/ }).isVisible()), { timeout: 60_000 }).toBeTruthy();
  if (await page.getByRole('button', { name: /^Latest analysis: Synthetic fixture/ }).isVisible()) {
    await page.getByRole('button', { name: /^Latest analysis: Synthetic fixture/ }).click();
    await page.getByRole('button', { name: 'Open full report', exact: true }).click();
  }
  await expect(panel.getByText('Anchor at 242s', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByLabel('Width (%)')).toHaveValue('12');
  await panel.getByRole('button', { name: 'Remove anchor at 242s', exact: true }).click();
  await expect(panel.getByText('Anchor at 242s', { exact: true })).toBeHidden({ timeout: 30_000 });
  expect((await readDocument(`matchAnalysisJobs/${jobId}`))?.data.pipelineGeneration).toBe(2);
  expect(errors).toEqual([]);
});
