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
  assert.ok(isAllowed(await getDocument(OWNER, `matchAnalysisJobs/${JOB}/tracking/current`)));
  assert.ok(isDenied(await getDocument(OTHER, `matchAnalysisJobs/${JOB}/tracking/current`)));
});
