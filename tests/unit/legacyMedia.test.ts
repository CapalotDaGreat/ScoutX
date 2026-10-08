import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isLegacyJob, planLegacyJob, summariseLegacy, type LegacyJob } from '../../functions/src/analysis/legacyMedia.ts';
import { isKnownJobObject } from '../../functions/src/analysis/mediaLifecycle.ts';

const prefix = 'profiles/u1/matchFootage/j1/';
const object = (name: string) => ({ name: `${prefix}${name}`, generation: '1', size: 10, updated: '2026-01-01T00:00:00Z' });
const objects = ['video.mp4', 'frames/frame_0.jpg', 'frames/frame_1.jpg', 'frames/frame_2.jpg', 'clips/clip_0.mp4', 'notes.txt', 'frames/../../x.jpg'].map(object);
const job: LegacyJob = {
  playerId: 'u1',
  status: 'complete',
  updatedAt: '2026-01-01T00:00:00Z',
  frames: [0, 1, 2].map((index) => ({ id: `frame_${index}`, index, storagePath: `${prefix}frames/frame_${index}.jpg` })),
  report: { evidence: [{ frameIds: ['frame_1'] }] },
  identityConfirmation: { state: 'confirmed', frameIds: ['frame_2'] },
};
const now = new Date('2026-10-09T00:00:00Z');

describe('legacy media plan', () => {
  test('only settled jobs the sweep never visited are legacy', () => {
    assert.equal(isLegacyJob(job, now), true);
    assert.equal(isLegacyJob({ ...job, mediaCleanupState: 'done' }, now), false);
    assert.equal(isLegacyJob({ ...job, mediaCleanupState: 'pending' }, now), false);
    assert.equal(isLegacyJob({ ...job, status: 'processing' }, now), false);
    assert.equal(isLegacyJob({ ...job, status: 'failed', updatedAt: '2026-10-08T00:00:00Z' }, now), false, 'retry window');
    assert.equal(isLegacyJob({ ...job, playerId: undefined }, now), false);
  });

  test('uncited frames are proposed for deletion; sources, clips, evidence and unknown objects are not', () => {
    const plan = planLegacyJob('j1', job, objects, { inMediaLibrary: false, includeSources: false });
    const action = (name: string) => plan.entries.find((entry) => entry.name === `${prefix}${name}`)?.action;
    assert.equal(action('frames/frame_0.jpg'), 'delete_uncited_frame');
    assert.equal(action('frames/frame_1.jpg'), 'keep_cited_frame');
    assert.equal(action('frames/frame_2.jpg'), 'keep_identity_frame');
    assert.equal(action('clips/clip_0.mp4'), 'keep_clip');
    assert.equal(action('video.mp4'), 'review_source_no_decision');
    assert.equal(action('notes.txt'), 'review_unrecognised');
    assert.equal(action('frames/../../x.jpg'), 'review_unrecognised');
    assert.equal(summariseLegacy([plan]).delete_uncited_frame.objects, 1);
  });

  test('sources are deleted only on an explicit decision and never when filed in the library', () => {
    const decided = planLegacyJob('j1', job, objects, { inMediaLibrary: false, includeSources: true });
    assert.equal(decided.entries.find((e) => e.name.endsWith('video.mp4'))?.action, 'delete_unused_source');
    const library = planLegacyJob('j1', job, objects, { inMediaLibrary: true, includeSources: true });
    assert.equal(library.entries.find((e) => e.name.endsWith('video.mp4'))?.action, 'keep_source_in_library');
    const retained = planLegacyJob('j1', { ...job, retainSource: true }, objects, { inMediaLibrary: false, includeSources: true });
    assert.equal(retained.entries.find((e) => e.name.endsWith('video.mp4'))?.action, 'keep_source_retained');
  });

  test('objects outside the job folder are never part of a plan', () => {
    const plan = planLegacyJob('j1', job, [{ ...object('x'), name: 'profiles/u1/matchFootage/j10/frames/frame_0.jpg' }], { inMediaLibrary: false, includeSources: true });
    assert.equal(plan.entries.length, 0);
  });

  test('lifecycle cleanup recognises only the object names the app writes', () => {
    assert.equal(isKnownJobObject(prefix, `${prefix}frames/frame_12.jpg`), true);
    assert.equal(isKnownJobObject(prefix, `${prefix}video.mp4`), true);
    assert.equal(isKnownJobObject(prefix, `${prefix}clips/clip_3.mp4`), true);
    assert.equal(isKnownJobObject(prefix, `${prefix}frames/frame_1.png`), false);
    assert.equal(isKnownJobObject(prefix, `${prefix}export.zip`), false);
    assert.equal(isKnownJobObject(prefix, 'profiles/u1/matchFootage/j2/video.mp4'), false);
  });
});
