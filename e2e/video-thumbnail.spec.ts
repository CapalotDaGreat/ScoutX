import fs from 'node:fs';
import ts from 'typescript';
import { expect, test } from '@playwright/test';

test('web thumbnail extracts a genuine local fixture frame and rejects remote URLs', async ({ page }) => {
  await page.route('http://thumbnail.pitchproof.test/', (route) => route.fulfill({ contentType: 'text/html', body: fs.readFileSync('public/index.html', 'utf8') }));
  await page.goto('http://thumbnail.pitchproof.test/');
  const source = fs.readFileSync('src/features/highlight-videos/services/videoThumbnailService.web.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const video = `data:video/mp4;base64,${fs.readFileSync('e2e/fixtures/clip.mp4').toString('base64')}`;
  const result = await page.evaluate(async ({ code, video }) => {
    const exports: Record<string, unknown> = {};
    const load = new Function('exports', 'require', code);
    load(exports, (name: string) => {
      if (name !== '@/features/highlight-videos/constants') throw new Error('Unexpected thumbnail dependency');
      return { VIDEO_STORAGE_LIMITS: { thumbnailQuality: 0.72 } };
    });
    const generate = exports.generateVideoThumbnail as (uri: string) => Promise<{ uri: string; width: number; height: number }>;
    let remoteRejected = false;
    try { await generate('https://example.com/private-video.mp4'); } catch { remoteRejected = true; }
    const frame = await generate(video);
    return { remoteRejected, width: frame.width, height: frame.height, jpeg: frame.uri.startsWith('data:image/jpeg;') };
  }, { code, video });
  expect(result.remoteRejected).toBe(true);
  expect(result.jpeg).toBe(true);
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(640);
});

test('picked duration uses seconds on web and milliseconds on native', async ({ page }) => {
  const source = fs.readFileSync('src/features/highlight-videos/services/materializePickedVideo.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const durations = await page.evaluate(async (code) => {
    async function materialize(os: string, duration: number): Promise<number> {
      const exports: Record<string, unknown> = {};
      new Function('exports', 'require', code)(exports, (name: string) => {
        if (name === 'react-native') return { Platform: { OS: os } };
        if (name === 'expo-file-system/legacy') return { cacheDirectory: null, getInfoAsync: () => { throw new Error('Native filesystem must not be used'); } };
        throw new Error('Unexpected picker dependency');
      });
      const pick = exports.materializePickedVideo as (asset: { uri: string; duration: number; fileSize: number; fileName: string }) => Promise<{ durationSec: number }>;
      return (await pick({ uri: os === 'web' ? 'blob:local-fixture' : 'file:///fixture.mp4', duration, fileSize: 100, fileName: 'fixture.mp4' })).durationSec;
    }
    return [await materialize('web', 2.5), await materialize('ios', 2500)];
  }, code);
  expect(durations).toEqual([3, 3]);
});
