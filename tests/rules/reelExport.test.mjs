// Runs the compiled exportReel callable and render trigger against the Firestore and Storage
// emulators with the bundled ffmpeg binary: validation, queueing, a real encode, and failures.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUCKET, PROJECT_ID } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const ffmpegPath = require('ffmpeg-static');

let db;
let bucket;
let exportReel;
let onReelExportQueued;
let counter = 0;

function uid(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

function call(authUid, data) {
  return exportReel.run({ data, auth: authUid ? { uid: authUid, token: {} } : undefined, rawRequest: {}, acceptsStreaming: false });
}

async function runTrigger(exportId) {
  const snap = await db.collection('reelExports').doc(exportId).get();
  await onReelExportQueued.run({ params: { exportId }, data: snap });
  return (await db.collection('reelExports').doc(exportId).get()).data();
}

function makeClip(withAudio) {
  const dir = mkdtempSync(join(tmpdir(), 'reel-src-'));
  const out = join(dir, 'clip.mp4');
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3'];
  if (withAudio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3');
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (withAudio) args.push('-c:a', 'aac');
  args.push('-shortest', out);
  execFileSync(ffmpegPath, args);
  return readFileSync(out);
}

async function seedMedia(owner, mediaId, contents, durationSec = 3) {
  const storagePath = `profiles/${owner}/videos/${mediaId}/video.mp4`;
  await bucket.file(storagePath).save(contents, { contentType: 'video/mp4' });
  await db.collection('players').doc(owner).collection('media').doc(mediaId).set({
    id: mediaId, ownerId: owner, storagePath, durationSec, uploadState: 'ready',
  });
}

async function seedReel(owner, segments, extra = {}) {
  const id = uid('reel');
  await db.collection('reels').doc(id).set({
    id, ownerId: owner, segments, aspectRatio: '9:16', coverMediaId: null, version: 1, status: 'draft', ...extra,
  });
  return id;
}

before(() => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  bucket = getStorage().bucket(BUCKET);
  ({ exportReel, onReelExportQueued } = require('./lib/reelRender.js'));
});

describe('exportReel validation', () => {
  test('requires auth and ownership', async () => {
    const owner = uid('player');
    const reelId = await seedReel(owner, []);
    await assert.rejects(call(null, { reelId }), (error) => error.code === 'unauthenticated');
    await assert.rejects(call(uid('other'), { reelId }), (error) => error.code === 'permission-denied');
    await assert.rejects(call(owner, { reelId: '../x' }), (error) => error.code === 'invalid-argument');
  });

  test('refuses empty, missing-source, invalid and over-long reels without queueing', async () => {
    const owner = uid('player');
    await seedMedia(owner, 'm1', Buffer.from('x'), 30);
    const cases = [
      [[], 'no_segments'],
      [[{ mediaId: 'ghost', inSec: 0, outSec: 2 }], 'missing_source'],
      [[{ mediaId: 'm1', inSec: 5, outSec: 5 }], 'invalid_clip'],
      [[{ mediaId: 'm1', inSec: 0, outSec: 40 }], 'invalid_clip'],
      [Array.from({ length: 4 }, () => ({ mediaId: 'm1', inSec: 0, outSec: 25 })), 'too_long'],
    ];
    for (const [segments, code] of cases) {
      const reelId = await seedReel(owner, segments);
      const result = await call(owner, { reelId });
      assert.equal(result.status, 'failed');
      assert.equal(result.errorCode, code);
      assert.equal(result.exportId, null);
    }
    const queued = await db.collection('reelExports').where('ownerId', '==', owner).get();
    assert.equal(queued.size, 0);
  });
});

describe('render pipeline', () => {
  test('renders a captioned reel, marks it ready only when the file exists, and reuses the export', async () => {
    const owner = uid('player');
    await seedMedia(owner, 'a', makeClip(true));
    await seedMedia(owner, 'b', makeClip(false));
    const reelId = await seedReel(owner, [
      { mediaId: 'a', inSec: 0.5, outSec: 2, caption: 'First touch' },
      { mediaId: 'b', inSec: 0, outSec: 1.5 },
    ], { coverMediaId: 'b' });

    const queued = await call(owner, { reelId });
    assert.equal(queued.status, 'queued');
    assert.ok(queued.exportId);
    const again = await call(owner, { reelId });
    assert.equal(again.exportId, queued.exportId);

    const done = await runTrigger(queued.exportId);
    assert.equal(done.status, 'ready', `errorCode ${done.errorCode}`);
    assert.equal(done.storagePath, `profiles/${owner}/reelExports/${queued.exportId}/reel.mp4`);
    assert.equal(done.hasCaptions, true);
    assert.equal(done.durationSec, 3);
    const [exists] = await bucket.file(done.storagePath).exists();
    assert.equal(exists, true);
    const [coverExists] = await bucket.file(done.coverPath).exists();
    assert.equal(coverExists, true);
    assert.ok(done.sizeBytes > 0);

    const rerun = await runTrigger(queued.exportId);
    assert.equal(rerun.status, 'ready');
  });

  test('fails with typed codes for undecodable and vanished sources', async () => {
    const owner = uid('player');
    await seedMedia(owner, 'bad', Buffer.from('definitely not a video file'), 0);
    const badReel = await seedReel(owner, [{ mediaId: 'bad', inSec: 0, outSec: 1 }]);
    const bad = await call(owner, { reelId: badReel });
    const badDone = await runTrigger(bad.exportId);
    assert.equal(badDone.status, 'failed');
    assert.equal(badDone.errorCode, 'unsupported_codec');
    assert.equal(badDone.storagePath, null);

    await seedMedia(owner, 'gone', makeClip(true));
    const goneReel = await seedReel(owner, [{ mediaId: 'gone', inSec: 0, outSec: 1 }]);
    const gone = await call(owner, { reelId: goneReel });
    await bucket.file(`profiles/${owner}/videos/gone/video.mp4`).delete();
    const goneDone = await runTrigger(gone.exportId);
    assert.equal(goneDone.status, 'failed');
    assert.equal(goneDone.errorCode, 'missing_source');
  });
});
