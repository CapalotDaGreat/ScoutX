import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteObject, isAllowed, downloadObject, isDenied, uploadObject } from './emulator.mjs';

const OWNER = 'storage-owner';
const OTHER = 'storage-other';
const MB = 1024 * 1024;

async function allowed(statusPromise, message) {
  const status = await statusPromise;
  assert.ok(isAllowed(status), `${message} (expected 2xx, got ${status})`);
}

async function denied(statusPromise, message) {
  const status = await statusPromise;
  assert.ok(isDenied(status), `${message} (expected 403, got ${status})`);
}

describe('avatar and cover images', () => {
  const avatar = `profiles/${OWNER}/avatar_1700000000000.jpg`;

  test('owners can upload JPEG profile images within the size limit', async () => {
    await allowed(uploadObject(OWNER, avatar, 'image/jpeg'), 'avatar');
    await allowed(uploadObject(OWNER, `profiles/${OWNER}/cover_1700000000000.jpg`, 'image/jpeg'), 'cover');
  });

  test('foreign, non-image, oversized and unexpected files are rejected', async () => {
    await denied(uploadObject(OTHER, avatar, 'image/jpeg'), 'foreign avatar');
    await denied(uploadObject(OWNER, `profiles/${OWNER}/avatar_1.jpg`, 'text/html'), 'html payload');
    await denied(uploadObject(OWNER, `profiles/${OWNER}/avatar_2.jpg`, 'image/jpeg', 10 * MB + 1), 'oversized');
    await denied(uploadObject(OWNER, `profiles/${OWNER}/payload.exe`, 'image/jpeg'), 'unexpected name');
    await denied(uploadObject(null, `profiles/${OWNER}/avatar_3.jpg`, 'image/jpeg'), 'unauthenticated');
  });
});

describe('GPS tracks', () => {
  const track = `gpsSessions/${OWNER}/session-1/points.json`;

  test('GPS tracks are owner-only JSON', async () => {
    await allowed(uploadObject(OWNER, track, 'application/json'), 'owner upload');
    await allowed(downloadObject(OWNER, track), 'owner read');
    await denied(downloadObject(OTHER, track), 'other read');
    await denied(uploadObject(OWNER, `gpsSessions/${OWNER}/session-2/points.json`, 'text/plain'), 'non-json');
    await denied(uploadObject(OTHER, `gpsSessions/${OWNER}/session-3/points.json`, 'application/json'), 'foreign');
  });
});

describe('highlight media', () => {
  const base = `profiles/${OWNER}/videos/video-1`;

  test('only the expected video and thumbnail files with matching types are accepted', async () => {
    await allowed(uploadObject(OWNER, `${base}/video.mp4`, 'video/mp4'), 'video');
    await allowed(uploadObject(OWNER, `${base}/thumb.jpg`, 'image/jpeg'), 'thumbnail');
    await denied(uploadObject(OWNER, `${base}/video.mp4`, 'image/jpeg'), 'video with image type');
    await denied(uploadObject(OWNER, `${base}/other.bin`, 'video/mp4'), 'unexpected file');
    await denied(downloadObject(OTHER, `${base}/video.mp4`), 'other read');
    await allowed(deleteObject(OWNER, `${base}/thumb.jpg`), 'owner delete');
  });
});

describe('match footage', () => {
  const base = `profiles/${OWNER}/matchFootage/job-1`;

  test('frames and full videos are owner-only with type and size limits', async () => {
    await allowed(uploadObject(OWNER, `${base}/frames/frame_001.jpg`, 'image/jpeg'), 'frame');
    await allowed(uploadObject(OWNER, `${base}/video.mp4`, 'video/mp4'), 'full match');
    await denied(uploadObject(OWNER, `${base}/frames/frame_002.jpg`, 'image/jpeg', 2 * MB + 1), 'oversized frame');
    await denied(uploadObject(OWNER, `${base}/frames/notes.txt`, 'text/plain'), 'unexpected frame file');
    await denied(uploadObject(OTHER, `${base}/frames/frame_003.jpg`, 'image/jpeg'), 'foreign frame');
    await denied(downloadObject(OTHER, `${base}/frames/frame_001.jpg`), 'other read');
    await denied(deleteObject(OTHER, `${base}/video.mp4`), 'other delete');
    await allowed(deleteObject(OWNER, `${base}/video.mp4`), 'owner delete');
  });
});

describe('everything else', () => {
  test('unknown paths are denied', async () => {
    await denied(uploadObject(OWNER, 'public/anything.jpg', 'image/jpeg'), 'unknown path');
  });
});
