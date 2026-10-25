import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGpsImportStorage, parseLocalGpsImport } from '../../src/features/gps/services/gpsImportStorage.ts';
import { confirmGpsImport, previewGpsImport } from '../../src/features/gps/services/gpsImportService.ts';

function fixture(owner = 'owner') {
  return confirmGpsImport(previewGpsImport('timestamp,latitude,longitude\n2026-01-01T12:00:00Z,47,8\n2026-01-01T12:00:01Z,47.00004,8', 'csv', owner), owner, 'Training');
}
function memory() {
  const data = new Map<string, string>();
  const storage = createGpsImportStorage({
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  });
  return { storage, data };
}
function flat() {
  const value = fixture();
  return { ...value.session, importProvenance: value.provenance, importQuality: value.quality };
}

describe('owner-scoped local GPS import persistence', () => {
  it('round-trips summary, provenance and quality without native modules', async () => {
    const { storage } = memory();
    const value = fixture();
    assert.deepEqual(await storage.save('owner', value), value);
    assert.deepEqual(await storage.load('owner'), value);
  });
  it('preserves valid populated heatmap cells with unknown orientation for saved rendering', async () => {
    const { storage } = memory();
    const value = fixture();
    assert.ok(value.session.heatmap.cells.length > 0);
    await storage.save('owner', value);
    const loaded = await storage.load('owner');
    assert.ok(loaded);
    assert.equal(loaded.provenance.orientation, 'unknown');
    assert.deepEqual(loaded.session.heatmap, value.session.heatmap);
    for (const cell of loaded.session.heatmap.cells) {
      assert.ok(Number.isInteger(cell.row) && cell.row >= 0 && cell.row < loaded.session.heatmap.rows);
      assert.ok(Number.isInteger(cell.col) && cell.col >= 0 && cell.col < loaded.session.heatmap.cols);
      assert.ok(Number.isFinite(cell.intensity) && cell.intensity > 0 && cell.intensity <= 1);
    }
  });
  it('isolates accounts and cleans only the requested owner, idempotently', async () => {
    const { storage } = memory();
    await storage.save('owner', fixture());
    const other = fixture('other');
    await storage.save('other', other);
    await storage.clear('owner');
    await storage.clear('owner');
    assert.equal(await storage.load('owner'), null);
    assert.deepEqual(await storage.load('other'), other);
    await assert.rejects(storage.save('owner', other), /owner/);
    await assert.rejects(storage.clear(''), /owner/);
    await assert.rejects(storage.load(' '), /owner/);
  });
  it('encodes owner key segments without prefix-based cross-account deletion', async () => {
    const { storage, data } = memory();
    await storage.save('owner/a', fixture('owner/a'));
    assert.ok(data.has('gps/local-import/owner%2Fa'));
    await storage.clear('owner');
    assert.ok(await storage.load('owner/a'));
  });
  it('strips unknown raw fields recursively on write as well as read', async () => {
    const { storage, data } = memory();
    const value = fixture();
    const polluted = {
      ...value, latitude: 47,
      session: { ...value.session, rawTrack: [{ longitude: 8 }],
        metrics: { ...value.session.metrics, latitude: 47 },
        heatmap: { ...value.session.heatmap, bounds: { longitude: 8 },
          cells: value.session.heatmap.cells.map((cell) => ({ ...cell, longitude: 8 })),
          extent: { ...value.session.heatmap.extent, latitude: 47 } },
      },
      provenance: { ...value.provenance, filename: 'private.gpx', uri: 'file:///private' },
      quality: { ...value.quality, raw: 'private data' },
    };
    assert.deepEqual(await storage.save('owner', polluted), value);
    const raw = data.get('gps/local-import/owner') ?? '';
    for (const field of ['latitude', 'longitude', 'rawTrack', 'filename', 'private', 'bounds']) assert.ok(!raw.includes(field), field);
    const legacy = { ...value.session, importProvenance: value.provenance, importQuality: value.quality, latitude: 47, points: [{ longitude: 8 }] };
    assert.deepEqual(parseLocalGpsImport(legacy, 'owner'), value);
  });
  it('rejects mismatched ownership, malformed JSON, unsupported provenance and invalid metrics', async () => {
    const { storage, data } = memory();
    for (const raw of ['{', 'null', '[]', JSON.stringify({ ...flat(), playerId: 'other' })]) {
      data.set('gps/local-import/owner', raw);
      assert.equal(await storage.load('owner'), null);
    }
    const base = flat();
    for (const importProvenance of [undefined, { ...base.importProvenance, format: 'fit' }, { ...base.importProvenance, matchId: 'invented' }, { ...base.importProvenance, orientation: 'confirmed' }, { ...base.importProvenance, verification: 'verified' }]) {
      assert.equal(parseLocalGpsImport({ ...base, importProvenance }, 'owner'), null);
    }
    assert.equal(parseLocalGpsImport({ ...base, metrics: { ...base.metrics, distanceM: Infinity } }, 'owner'), null);
    assert.equal(parseLocalGpsImport({ ...base, heatmap: { ...base.heatmap, cells: [{ row: -1, col: 0, intensity: 1 }] } }, 'owner'), null);
    const bad = fixture();
    bad.provenance = { ...bad.provenance, matchId: 'invented' } as unknown as typeof bad.provenance;
    await assert.rejects(storage.save('owner', bad), /invalid/);
  });
  it('propagates storage failures so UI cannot claim success', async () => {
    const fail = async () => { throw new Error('disk'); };
    const storage = createGpsImportStorage({ getItem: fail, setItem: fail, removeItem: fail });
    await assert.rejects(storage.save('owner', fixture()), /disk/);
    await assert.rejects(storage.load('owner'), /disk/);
    await assert.rejects(storage.clear('owner'), /disk/);
  });
  it('orders owner cleanup after an in-flight save without blocking another owner', async () => {
    const data = new Map<string, string>();
    let release = () => {};
    const saving = new Promise<void>((resolve) => { release = resolve; });
    const storage = createGpsImportStorage({
      async getItem(key) { return data.get(key) ?? null; },
      async setItem(key, value) {
        if (key === 'gps/local-import/owner') await saving;
        data.set(key, value);
      },
      async removeItem(key) { data.delete(key); },
    });
    const save = storage.save('owner', fixture());
    const clear = storage.clear('owner');
    await storage.save('other', fixture('other'));
    assert.ok(await storage.load('other'));
    release();
    await Promise.all([save, clear]);
    assert.equal(await storage.load('owner'), null);
  });
});
