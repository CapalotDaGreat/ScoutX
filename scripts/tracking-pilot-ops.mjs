#!/usr/bin/env node
/**
 * Operator commands for the tracking pilot gate (functions/src/analysis/pilotGate.ts). Uses the compiled
 * functions/lib of the checkout it is run from, so run it from the exact commit that was rehearsed.
 *
 *   node scripts/tracking-pilot-ops.mjs status
 *   node scripts/tracking-pilot-ops.mjs stop
 *   node scripts/tracking-pilot-ops.mjs enable --allow uid1,uid2 --worker-version <approved> [--hold true|false]
 *   node scripts/tracking-pilot-ops.mjs withhold <jobId> --reason <text>
 *   node scripts/tracking-pilot-ops.mjs release  <jobId> --reviewer <name>
 *   node scripts/tracking-pilot-ops.mjs reprocess <jobId>     (re-authorises the job under the current enable, queues a full resolve)
 *   node scripts/tracking-pilot-ops.mjs held-images <jobId>   (reviewer: list held images; read them with server credentials)
 *   node scripts/tracking-pilot-ops.mjs prune-images <jobId>  (contain held copies' images, discard unreferenced ones)
 *
 * Safety: refuses to run unless FIRESTORE_EMULATOR_HOST is set, or --project <id> --production-authorized is given.
 * The production flag exists for a later, separately authorised operation; this rehearsal never uses it.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../functions/package.json'));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const [command, jobId] = args;

const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!emulated && !(flag('project') && args.includes('--production-authorized'))) {
  console.error('Refusing: no emulator configured and no --project <id> --production-authorized.');
  process.exit(2);
}

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getFunctions } = require('firebase-admin/functions');
const gate = require('../functions/lib/analysis/pilotGate.js');
const { MATCH_COLLECTION } = require('../functions/lib/analysis/frameAnalysis.js');
const { TRACKING_COLLECTION } = require('../functions/lib/analysis/trackingV3.js');
const { taskQueueName } = require('../functions/lib/region.js');
const imagesLib = require('../functions/lib/analysis/trackingImages.js');

if (!getApps().length) {
  const project = flag('project') ?? process.env.GCLOUD_PROJECT;
  initializeApp(project ? { projectId: project, storageBucket: flag('bucket') ?? process.env.REHEARSAL_BUCKET ?? `${project}.appspot.com` } : {});
}
const db = getFirestore();
const pilotRef = db.collection(gate.PILOT_COLLECTION).doc(gate.PILOT_DOC);
const now = () => new Date();

async function main() {
  switch (command) {
    case 'status': {
      const snap = await pilotRef.get();
      return { exists: snap.exists, config: snap.exists ? gate.parsePilotConfig(snap.data()) : null, raw: snap.data() ?? null };
    }
    case 'stop': {
      // Kill switch. Merge keeps the allowlist for the record; enabled:false alone stops every task.
      await pilotRef.set({ enabled: false, stoppedAt: now().toISOString() }, { merge: true });
      return { stopped: true };
    }
    case 'enable': {
      const allow = (flag('allow') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const workerVersion = flag('worker-version');
      if (!allow.length || !workerVersion) throw new Error('--allow and --worker-version are required');
      const hold = flag('hold') === undefined ? true : flag('hold') === 'true';
      // enabledAt starts a new authorisation epoch: work authorised before it (queued before a stop) cannot run.
      await pilotRef.set({ enabled: true, allowlist: allow, workerVersion, holdReports: hold, enabledAt: now().toISOString() });
      return { enabled: true, allow, workerVersion, holdReports: hold };
    }
    case 'withhold': {
      if (!jobId) throw new Error('jobId required');
      const t0 = Date.now();
      const result = await gate.withholdPublishedReport(db, MATCH_COLLECTION, TRACKING_COLLECTION, jobId, flag('reason') ?? 'operator', now,
        imagesLib.storageImageBucket);
      return { result, ms: Date.now() - t0 };
    }
    case 'release': {
      if (!jobId || !flag('reviewer')) throw new Error('jobId and --reviewer required');
      return { result: await gate.releaseHeldReport(db, MATCH_COLLECTION, TRACKING_COLLECTION, jobId, flag('reviewer'), now,
        imagesLib.storageImageBucket) };
    }
    case 'reprocess': {
      if (!jobId) throw new Error('jobId required');
      if (typeof gate.authorizeRun !== 'function') throw new Error('this commit has no run authorisation (authorizeRun)');
      const r = await gate.authorizeRun(db, MATCH_COLLECTION, TRACKING_COLLECTION, jobId, now);
      if (r !== 'authorized') return { result: r };
      const fb = await db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION).doc('feedback').get();
      await getFunctions().taskQueue(taskQueueName('resolveTrackingTask'))
        .enqueue({ jobId, feedbackRevision: fb.get('revision') ?? 0, scope: 'full' }, { dispatchDeadlineSeconds: 900 });
      return { result: 'queued' };
    }
    case 'prune-images': {
      // Reconcile a job's review images with its documents (contain images of held copies, discard unreferenced ones).
      if (!jobId) throw new Error('jobId required');
      const job = await db.collection(MATCH_COLLECTION).doc(jobId).get();
      if (!job.exists) return { result: 'no_job' };
      const docs = await imagesLib.readImageDocs(db, MATCH_COLLECTION, jobId);
      return { result: await imagesLib.pruneJobImages(imagesLib.storageImageBucket, job.get('playerId'), jobId, docs,
        { olderThanMs: Date.now() - imagesLib.IMAGE_ATTEMPT_MAX_MS }) };
    }
    case 'held-images': {
      // Authorized review path: lists the held images of a job for the reviewer (server credentials only).
      if (!jobId) throw new Error('jobId required');
      const job = await db.collection(MATCH_COLLECTION).doc(jobId).get();
      if (!job.exists) return { result: 'no_job' };
      const list = await imagesLib.storageImageBucket.list(`profiles/${job.get('playerId')}/matchFootage/${jobId}/${imagesLib.HELD_IMAGE_DIR}/`);
      return { result: list.map((o) => o.name) };
    }
    default:
      throw new Error(`unknown command ${command}`);
  }
}

main().then((out) => { console.log(JSON.stringify({ command, jobId: jobId ?? null, ...out })); process.exit(0); })
  .catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
