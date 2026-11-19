import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearFirestore, getDocument, isAllowed, isDenied, setDocument } from './emulator.mjs';

// Pilot gate (functions/src/analysis/pilotGate.ts): the configuration and held reports are server-only.
const OWNER = 'pilot-owner';
const OTHER = 'pilot-other';
const JOB = 'job_pilot_1';

async function seed(path, data) {
  const s = await setDocument('admin', path, data);
  assert.ok(isAllowed(s), `seed ${path} (${s})`);
}

beforeEach(async () => {
  await clearFirestore();
  await seed(`matchAnalysisJobs/${JOB}`, { playerId: OWNER, status: 'complete' });
  await seed('opsConfig/trackingPilot', { enabled: true, allowlist: [OWNER], workerVersion: 'football-cv/0.7.0' });
  await seed(`matchAnalysisJobs/${JOB}/pilotHeld/current`, { report: { moments: [] }, heldAt: 'now' });
  await seed(`matchAnalysisJobs/${JOB}/pilotHeld/discovery`, { moments: [{ id: 'd_1' }], heldAt: 'now' });
  await seed(`matchAnalysisJobs/${JOB}/tracking/current`, { report: null, stale: true });
});

test('nobody but the server reads or writes the pilot configuration', async () => {
  for (const uid of [OWNER, OTHER, null]) {
    assert.ok(isDenied(await getDocument(uid, 'opsConfig/trackingPilot')), `read as ${uid}`);
    assert.ok(isDenied(await setDocument(uid, 'opsConfig/trackingPilot', { enabled: true, allowlist: [OTHER], workerVersion: 'x' })),
      `write as ${uid}`);
  }
});

test('a held report is invisible to its owner until released; the owner still reads tracking/current', async () => {
  assert.ok(isDenied(await getDocument(OWNER, `matchAnalysisJobs/${JOB}/pilotHeld/current`)));
  assert.ok(isDenied(await getDocument(OTHER, `matchAnalysisJobs/${JOB}/pilotHeld/current`)));
  assert.ok(isDenied(await setDocument(OWNER, `matchAnalysisJobs/${JOB}/pilotHeld/current`, { report: null })));
  // Held discovery sightings (2026-11-19 rehearsal fix) are as private as held reports.
  assert.ok(isDenied(await getDocument(OWNER, `matchAnalysisJobs/${JOB}/pilotHeld/discovery`)));
  assert.ok(isDenied(await setDocument(OWNER, `matchAnalysisJobs/${JOB}/pilotHeld/discovery`, { moments: [] })));
  assert.ok(isAllowed(await getDocument(OWNER, `matchAnalysisJobs/${JOB}/tracking/current`)));
  assert.ok(isDenied(await getDocument(OTHER, `matchAnalysisJobs/${JOB}/tracking/current`)));
});

// R2 (2026-11-19): held/withheld review and discovery images live under …/pilotHeld/ and no client may read,
// write or delete them; released images under …/tracking/ stay owner-only.
test('held review images are server-only; released images are owner-only', async () => {
  const { adminUploadObject, downloadObject, uploadObject, deleteObject } = await import('./emulator.mjs');
  const held = `profiles/${OWNER}/matchFootage/${JOB}/pilotHeld/q_1_r0.jpg`;
  const pub = `profiles/${OWNER}/matchFootage/${JOB}/tracking/q_1_r0.jpg`;
  assert.ok(isAllowed(await adminUploadObject(held, 'image/jpeg')));
  assert.ok(isAllowed(await adminUploadObject(pub, 'image/jpeg')));
  for (const who of [OWNER, OTHER, null]) {
    assert.ok(isDenied(await downloadObject(who, held)), `read held as ${who}`);
    assert.ok(isDenied(await uploadObject(who, held, 'image/jpeg')), `write held as ${who}`);
    assert.ok(isDenied(await deleteObject(who, held)), `delete held as ${who}`);
  }
  assert.ok(isAllowed(await downloadObject(OWNER, pub)));
  assert.ok(isDenied(await downloadObject(OTHER, pub)));
  assert.ok(isDenied(await downloadObject(null, pub)));
});
