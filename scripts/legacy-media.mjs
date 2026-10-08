#!/usr/bin/env node
// Legacy match-media report and exact-object cleanup (see functions/src/analysis/legacyMedia.ts).
//
//   Dry run (read-only, default):
//     node scripts/legacy-media.mjs --project <projectId> --bucket <bucketName> [--include-sources]
//   Apply a reviewed dry-run report:
//     node scripts/legacy-media.mjs --project <projectId> --bucket <bucketName> --apply <report.json>
//
// Uses Application Default Credentials (an operator account with Firestore + Storage access);
// nothing is hard-coded. Reports are written to .local/legacy-media/ (gitignored) because they
// contain private object names; the console only shows counts. Deletion is per exact object and
// generation, never by prefix, and only for jobs that are still legacy when the report is applied.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions/package.json'));

function arg(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const projectId = arg('--project');
const bucketName = arg('--bucket');
const applyPath = arg('--apply');
const includeSources = process.argv.includes('--include-sources');
if (!projectId || !bucketName) {
  console.error('CONFIG_REQUIRED: --project and --bucket must be given explicitly');
  process.exit(2);
}

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const legacy = require('./lib/analysis/legacyMedia.js');
const { jobMediaPrefix } = require('./lib/analysis/mediaLifecycle.js');
const { footageMediaId } = require('./lib/uploads/model.js');

initializeApp({ projectId, storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();
const TERMINAL = ['complete', 'failed', 'cancelled', 'expired'];

async function listObjects(prefix) {
  const [files] = await bucket.getFiles({ prefix });
  return files.map((file) => ({
    name: file.name,
    generation: String(file.metadata.generation),
    size: Number(file.metadata.size ?? 0),
    updated: String(file.metadata.updated ?? ''),
  }));
}

async function planFor(doc, now) {
  const job = doc.data();
  if (!legacy.isLegacyJob(job, now)) return null;
  const objects = await listObjects(jobMediaPrefix(job.playerId, doc.id));
  const library = await db.collection('players').doc(job.playerId).collection('media').doc(footageMediaId(doc.id)).get();
  return legacy.planLegacyJob(doc.id, job, objects, { inMediaLibrary: library.exists, includeSources });
}

async function dryRun() {
  const now = new Date();
  const plans = [];
  for (const status of TERMINAL) {
    const snap = await db.collection('matchAnalysisJobs').where('status', '==', status).get();
    for (const doc of snap.docs) {
      const plan = await planFor(doc, now);
      if (plan && plan.entries.length > 0) plans.push(plan);
    }
  }
  const report = { kind: 'legacy-media-dry-run', projectId, bucket: bucketName, includeSources, generatedAt: now.toISOString(), summary: legacy.summariseLegacy(plans), plans };
  const dir = join(root, '.local/legacy-media');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `report-${now.toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`dry run only; report written to ${path.slice(root.length + 1)}`);
}

async function apply(path) {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  if (report.kind !== 'legacy-media-dry-run' || report.projectId !== projectId || report.bucket !== bucketName) {
    throw new Error('report does not belong to this project/bucket');
  }
  const now = new Date();
  let deleted = 0;
  let skipped = 0;
  for (const planned of report.plans) {
    const ref = db.collection('matchAnalysisJobs').doc(planned.jobId);
    const doc = await ref.get();
    const current = doc.exists ? await planFor(doc, now) : null;
    if (!current || current.ownerId !== planned.ownerId) {
      skipped += planned.entries.length;
      continue;
    }
    // Only objects that are still the same generation and still classified for deletion.
    const stillDeletable = new Map(current.entries.filter((e) => legacy.isDeleteAction(e.action)).map((e) => [`${e.name}#${e.generation}`, e]));
    const removed = new Set();
    for (const entry of planned.entries.filter((e) => legacy.isDeleteAction(e.action))) {
      if (!stillDeletable.has(`${entry.name}#${entry.generation}`)) {
        skipped += 1;
        continue;
      }
      await bucket.file(entry.name).delete({ ifGenerationMatch: entry.generation, ignoreNotFound: true });
      removed.add(entry.name);
      deleted += 1;
    }
    const job = doc.data();
    await ref.update({
      frames: (job.frames ?? []).filter((frame) => !removed.has(frame.storagePath)),
      ...(removed.has(`${jobMediaPrefix(job.playerId, planned.jobId)}video.mp4`) ? { videoStoragePath: null } : {}),
      mediaCleanupState: 'done',
      mediaLifecycle: { legacyBackfill: true, deletedObjectCount: removed.size, cleanedAt: now.toISOString() },
    });
  }
  console.log(JSON.stringify({ deleted, skipped }, null, 2));
}

try {
  if (applyPath) await apply(applyPath);
  else await dryRun();
} catch (error) {
  console.error(`legacy-media failed: ${error instanceof Error ? error.name : 'Error'}`);
  process.exit(1);
}
