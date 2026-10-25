import { chromium, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const pack = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const errors = [], network = [];
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  page.on('dialog', dialog => dialog.dismiss());
}
async function download(page, id, name) {
  const event = page.waitForEvent('download');
  await page.locator(id).click();
  const result = await event;
  await result.saveAs(path.join(output, name));
  return JSON.parse(await fs.readFile(path.join(output, name), 'utf8'));
}
try {
  const page = await context.newPage(); observe(page);
  await page.goto(pathToFileURL(path.join(pack, 'index.html')).href);
  await expect(page.locator('canvas')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#reviewer').fill('synthetic_reviewer');
  const bounds = await page.locator('canvas').boundingBox();
  await page.mouse.move(bounds.x + bounds.width*10/96, bounds.y + bounds.height*10/64);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width*40/96, bounds.y + bounds.height*50/64, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#x1')).toHaveValue('10');
  await expect(page.locator('#y2')).toHaveValue('50');
  for (const [id, value] of [['x1', 10], ['y1', 10], ['x2', 40], ['y2', 50]]) {
    await page.locator(`#${id}`).fill(String(value));
    await page.locator(`#${id}`).press('Tab');
  }
  await expect(page.locator('#visibility')).toHaveValue('visible');
  await page.locator('#legibility').selectOption('yes');
  await page.locator('#reviewed').check();
  await expect(page.locator('#progress-text')).toHaveText('1 / 2 frames reviewed');
  const draft = await download(page, '#draft', 'synthetic-draft.json');
  expect(draft.reviewed).toBe(false);
  expect(draft.frames[0].box).toEqual([10, 10, 40, 50]);
  await page.locator('#next').click();
  await page.locator('#visibility').selectOption('off_camera');
  await page.locator('#legibility').selectOption('no');
  await page.locator('#reviewed').check();
  await expect(page.locator('#export')).toBeEnabled();
  const labels = await download(page, '#export', 'synthetic-reviewed.json');
  expect(labels.reviewed).toBe(true);
  expect(labels.frames[1].box).toBe(null);
  const notes = await download(page, '#notes', 'synthetic-notes.json');
  expect(notes.overlaysShown).toBe(false);
  expect(notes.frames.map(frame => frame.numberLegible)).toEqual(['yes', 'no']);
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

  const restored = await context.newPage(); observe(restored);
  await restored.goto(pathToFileURL(path.join(pack, 'index.html')).href);
  await restored.locator('#file-import').setInputFiles(path.join(output, 'synthetic-reviewed.json'));
  await expect(restored.locator('#progress-text')).toHaveText('0 / 2 frames reviewed');
  await expect(restored.locator('#export')).toBeDisabled();
  await restored.locator('#file-import').setInputFiles(path.join(output, 'synthetic-notes.json'));
  await expect(restored.locator('#progress-text')).toHaveText('2 / 2 frames reviewed');
  await restored.locator('#tracks').check();
  await restored.locator('#tracks').uncheck();
  const exposed = await download(restored, '#notes', 'synthetic-exposed-notes.json');
  expect(exposed.overlaysShown).toBe(true);
  const invalid = structuredClone(labels);
  invalid.frames[0].box = [0, 0, 999, 50];
  await fs.writeFile(path.join(output, 'synthetic-invalid.json'), JSON.stringify(invalid));
  await restored.locator('#file-import').setInputFiles(path.join(output, 'synthetic-invalid.json'));
  await expect(restored.locator('#status')).toHaveText('Target, schema or geometry mismatch');
  await expect(restored.locator('#progress-text')).toHaveText('2 / 2 frames reviewed');
  await restored.setViewportSize({ width: 390, height: 844 });
  expect(await restored.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await restored.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  console.log(JSON.stringify({ status: 'passed', desktop: true, mobile: true,
    exportImport: true, noExternalRequests: true, overlayExposureLatched: true, syntheticLabelsOnly: true }));
} finally {
  await context.close();
  await browser.close();
}
