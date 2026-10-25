import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PROJECT_ID, setDocument, getDocument, isDenied, isAllowed } from './emulator.mjs';
import { backfill, parseOptions } from '../../scripts/backfill-discovery-search.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { buildDiscoverySearchIndex } = require('./lib/discoverySearchIndex.js');
const { refreshDiscoverySearchIndex } = require('./lib/discoverySearchMaintenance.js');
let db;
before(() => { if (!getApps().length) initializeApp({ projectId: PROJECT_ID }); db = getFirestore(); });
test('indexed Firestore search reaches beyond 500, orders globally and unlisting removes its tokens', async () => {
  const writer = db.bulkWriter();
  for (let i = 0; i < 650; i++) {
    const id = `index-test-${String(i).padStart(4, '0')}`;
    const player = { fullName: i === 620 ? 'Late Needle' : `Player ${i}`, club: 'Test FC', age: i % 30,
      updatedAt: '2026-10-24T12:00:00Z', viewCount: 0 };
    writer.set(db.collection('discoverablePlayers').doc(id), { ...player, _search: buildDiscoverySearchIndex(player) });
  }
  await writer.close();
  const found = await db.collection('discoverablePlayers').where('_search.tokens', 'array-contains', 'all:needle').orderBy('_search.order.name').get();
  assert.deepEqual(found.docs.map((d) => d.id), ['index-test-0620']);
  let cursor = null; const ids = [];
  do {
    let query = db.collection('discoverablePlayers').orderBy('_search.order.name').orderBy(FieldPath.documentId()).limit(40);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get(); ids.push(...page.docs.map((d) => d.id)); cursor = page.size === 40 ? page.docs.at(-1) : null;
  } while (cursor);
  assert.equal(ids.filter((id) => id.startsWith('index-test-')).length, 650);
  assert.equal(new Set(ids).size, ids.length);
  const ref = found.docs[0].ref;
  await ref.delete(); await refreshDiscoverySearchIndex(ref.id, db);
  assert.equal((await ref.get()).exists, false);
  const cleanup = db.bulkWriter(); for (const id of ids) if (id.startsWith('index-test-')) cleanup.delete(db.collection('discoverablePlayers').doc(id)); await cleanup.close();
});
test('maintenance is idempotent and indexes only currently published fields', async () => {
  const ref = db.collection('discoverablePlayers').doc('index-maintenance');
  await ref.set({ fullName: 'Public Name', phone: 'PRIVATE_PHONE', biography: 'PRIVATE_BIO' });
  await refreshDiscoverySearchIndex(ref.id, db);
  const first = await ref.get(); await refreshDiscoverySearchIndex(ref.id, db);
  assert.equal((await ref.get()).updateTime.toMillis(), first.updateTime.toMillis());
  assert.equal(JSON.stringify(first.get('_search')).includes('PRIVATE'), false);
  await ref.delete();
});
test('migration dry run writes nothing; authorized apply indexes legacy rows and enables readiness', async () => {
  const ref = db.collection('discoverablePlayers').doc('legacy-index-row');
  await ref.set({ fullName: 'Legacy Public' });
  const state = db.collection('discoverySearchState').doc('current'); await state.delete();
  assert.equal((await backfill(db, false)).status, 'dry_run_only');
  assert.equal((await state.get()).exists, false); assert.equal((await ref.get()).get('_search'), undefined);
  await backfill(db, true);
  assert.equal((await state.get()).get('ready'), true);
  assert.equal((await ref.get()).get('_search.version'), 1);
  assert.ok(isAllowed(await getDocument('viewer', 'discoverySearchState/current')));
  assert.ok(isDenied(await setDocument('viewer', 'discoverySearchState/current', { version: 1, ready: true })));
  await ref.delete();
});
test('migration CLI requires explicit write authorization and rejects production/emulator mixing', () => {
  assert.throws(() => parseOptions(['--project', 'real-project', '--apply']));
  assert.throws(() => parseOptions(['--project', 'real-project', '--apply', '--authorize-index-write']));
  assert.equal(parseOptions(['--project', 'demo-scoutx'])['--apply'], undefined);
});
