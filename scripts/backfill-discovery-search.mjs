import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(new URL('../functions/package.json', import.meta.url));

export function parseOptions(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--project', '--apply', '--authorize-index-write'].includes(key) || Object.hasOwn(result, key)) throw new Error('Invalid option');
    result[key] = key === '--project' ? args[++i] : true;
  }
  if (!/^[a-z][a-z0-9-]{4,60}$/.test(result['--project'] ?? '')) throw new Error('Explicit project required');
  if (result['--apply'] && !result['--authorize-index-write']) throw new Error('Explicit metadata-write authorization required');
  if (process.env.FIRESTORE_EMULATOR_HOST && (!result['--project'].startsWith('demo-')
    || !/^(127\.0\.0\.1|localhost):[0-9]+$/.test(process.env.FIRESTORE_EMULATOR_HOST))) throw new Error('Mixed emulator/project configuration');
  return result;
}

export async function backfill(db, apply) {
  const { FieldPath } = require('firebase-admin/firestore');
  const { buildDiscoverySearchIndex, sameDiscoverySearchIndex, SEARCH_SORTS } = require('./lib/discoverySearchIndex.js');
  const state = db.collection('discoverySearchState').doc('current');
  const token = randomUUID();
  const lease = () => Date.now() + 15 * 60 * 1000;
  if (apply) await db.runTransaction(async (tx) => {
    const old = await tx.get(state);
    if (old.get('leaseUntilMs') > Date.now()) throw new Error('Another index migration is active');
    tx.set(state, { version: 1, ready: false, token, leaseUntilMs: lease() });
  });
  let after = null, inspected = 0;
  while (true) {
    let query = db.collection('discoverablePlayers').orderBy(FieldPath.documentId()).limit(100);
    if (after) query = query.startAfter(after);
    const page = await query.get();
    for (const document of page.docs) {
      inspected++;
      if (apply) await db.runTransaction(async (tx) => {
        const owner = await tx.get(state);
        const current = await tx.get(document.ref);
        if (owner.get('token') !== token || owner.get('leaseUntilMs') < Date.now()) throw new Error('Index migration ownership changed');
        if (current.exists) tx.update(current.ref, { _search: buildDiscoverySearchIndex(current.data()) });
        if (owner.get('leaseUntilMs') - Date.now() < 5 * 60 * 1000) tx.update(state, { leaseUntilMs: lease() });
      });
    }
    if (page.size < 100) break;
    after = page.docs.at(-1).id;
  }
  if (apply) {
    let verifiedAfter = null;
    while (true) {
      let query = db.collection('discoverablePlayers').orderBy(FieldPath.documentId()).limit(100);
      if (verifiedAfter) query = query.startAfter(verifiedAfter);
      const page = await query.get();
      if (page.docs.some((row) => !sameDiscoverySearchIndex(row.get('_search'), buildDiscoverySearchIndex(row.data())))) throw new Error('Index verification incomplete');
      if (page.size < 100) break;
      verifiedAfter = page.docs.at(-1).id;
    }
    // A successful backfill is not enough if required native indexes are still building.
    for (const sort of SEARCH_SORTS) await db.collection('discoverablePlayers')
      .where('_search.tokens', 'array-contains', 'all:indexreadinessprobe')
      .orderBy(`_search.order.${sort}`).orderBy(FieldPath.documentId()).limit(1).get();
    await db.runTransaction(async (tx) => {
      const owner = await tx.get(state);
      if (owner.get('token') !== token || owner.get('leaseUntilMs') < Date.now()) throw new Error('Index migration ownership changed');
      tx.update(state, { ready: true, leaseUntilMs: 0 });
    });
  }
  return { status: apply ? 'indexed' : 'dry_run_only', inspected };
}

export async function main(args) {
  const options = parseOptions(args);
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: options['--project'] });
  return backfill(getFirestore(app), options['--apply'] === true);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Search migration failed. Index readiness was not granted. Check authorization, project and migration lease.'); process.exitCode = 1; });
}
