#!/usr/bin/env node
/**
 * After restoring Firestore from backup/PITR into an isolated database, re-apply
 * account deletions for any uid that still has a users/{uid} doc but also has a
 * legalRetention deletion_receipt for subjectHash(uid).
 *
 * SAFETY:
 * - Default is --dry-run (no writes).
 * - Refuses database "(default)" unless --allow-default-database is passed
 *   (restore drills should use a clone DB id).
 * - Refuses production-looking targets without --execute.
 * - Never prints emails; logs uid hashes and counts only.
 *
 * Usage:
 *   node scripts/reapply-deletions-after-restore.mjs --project scoutx-230b0 --database-id RESTORE_DB --dry-run
 *   node scripts/reapply-deletions-after-restore.mjs --project scoutx-230b0 --database-id RESTORE_DB --execute
 *
 * Requires Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS.
 * Prefer running against an emulator by setting FIRESTORE_EMULATOR_HOST.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(new URL('../functions/package.json', import.meta.url));

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    'database-id': { type: 'string', default: '(default)' },
    'dry-run': { type: 'boolean', default: true },
    execute: { type: 'boolean', default: false },
    'allow-default-database': { type: 'boolean', default: false },
    limit: { type: 'string', default: '0' },
  },
});

const projectId = values.project;
const databaseId = values['database-id'];
const execute = values.execute === true;
const dryRun = !execute;
const allowDefault = values['allow-default-database'] === true;
const limit = Number(values.limit) || 0;

if (!projectId) {
  console.error('Missing --project');
  process.exit(2);
}
if (databaseId === '(default)' && !allowDefault) {
  console.error(
    'Refusing database "(default)". Use a restore clone --database-id, or pass --allow-default-database after explicit approval.',
  );
  process.exit(2);
}

function subjectHash(uid) {
  return createHash('sha256').update(`scoutx-subject:${uid}`).digest('hex');
}

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({ projectId });
}

const db =
  databaseId && databaseId !== '(default)'
    ? getFirestore(getApps()[0], databaseId)
    : getFirestore();

async function loadDeletionHashes() {
  const hashes = new Set();
  const snap = await db.collection('legalRetention').where('kind', '==', 'deletion_receipt').get();
  for (const doc of snap.docs) {
    const hash = doc.get('subjectHash');
    if (typeof hash === 'string' && hash.length > 0) hashes.add(hash);
  }
  return hashes;
}

async function main() {
  console.log(
    JSON.stringify({
      mode: dryRun ? 'dry-run' : 'execute',
      projectId,
      databaseId,
      emulator: Boolean(process.env.FIRESTORE_EMULATOR_HOST),
    }),
  );

  const deletionHashes = await loadDeletionHashes();
  console.log(`deletion_receipts=${deletionHashes.size}`);

  const users = await db.collection('users').select().get();
  let matched = 0;
  let processed = 0;
  const sample = [];

  let deleteAllUserData = null;
  let verifyUserDataDeleted = null;
  if (!dryRun) {
    // Built functions output — run `npm run build --prefix functions` first.
    ({ deleteAllUserData, verifyUserDataDeleted } = require('../functions/lib/accountDeletion.js'));
  }

  for (const doc of users.docs) {
    const uid = doc.id;
    const hash = subjectHash(uid);
    if (!deletionHashes.has(hash)) continue;
    matched += 1;
    if (sample.length < 5) sample.push(hash.slice(0, 12));
    if (limit > 0 && processed >= limit) continue;

    if (dryRun) {
      processed += 1;
      continue;
    }

    const { failures } = await deleteAllUserData(uid);
    const remaining = await verifyUserDataDeleted(uid);
    processed += 1;
    console.log(
      JSON.stringify({
        subjectHashPrefix: hash.slice(0, 12),
        failures: failures.length,
        remaining: remaining.length,
      }),
    );
  }

  console.log(
    JSON.stringify({
      usersScanned: users.size,
      matchedDeletionReceipts: matched,
      processed,
      sampleSubjectHashPrefixes: sample,
      dryRun,
    }),
  );

  if (dryRun) {
    console.log('Dry-run only. Re-run with --execute on an isolated restore database after approval.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
