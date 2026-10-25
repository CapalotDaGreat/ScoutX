import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createGpsImportOperationGuard, readGpsImportAsset } from '../../src/features/gps/services/gpsImportInteraction.ts';
import { GPS_IMPORT_MAX_BYTES, previewGpsImport } from '../../src/features/gps/services/gpsImportService.ts';

describe('GPS import operation guards', () => {
  it('blocks disabled, signed-out, duplicate and stale-owner actions before React rerenders', () => {
    const guard = createGpsImportOperationGuard();
    assert.equal(guard.begin(null), null);
    guard.update({ ownerId: 'a', disabled: true });
    assert.equal(guard.begin('a'), null);
    guard.update({ ownerId: 'a', disabled: false });
    assert.equal(guard.begin('b'), null);
    const token = guard.begin('a');
    assert.ok(token);
    assert.equal(guard.begin('a'), null);
    assert.equal(guard.finish({ ...token }), false);
    assert.equal(guard.finish(token), true);
    assert.ok(guard.begin('a'));
  });
  it('invalidates picker/save/delete success and failure callbacks across A -> B -> A', () => {
    const guard = createGpsImportOperationGuard();
    guard.update({ ownerId: 'a', disabled: false });
    const token = guard.begin('a');
    assert.ok(token);
    guard.update({ ownerId: 'b', disabled: false });
    guard.update({ ownerId: 'a', disabled: false });
    assert.equal(guard.isCurrent(token), false);
    assert.equal(guard.begin('a'), null);
    assert.equal(guard.finish(token), true);
    const next = guard.begin('a');
    assert.ok(next);
    assert.equal(guard.finish(token), false);
    assert.equal(guard.isCurrent(next), true);
  });
  it('invalidates late initial reads after mutations and pending operations on disable/unmount', () => {
    const guard = createGpsImportOperationGuard();
    guard.update({ ownerId: 'a', disabled: false });
    const read = guard.capture();
    const token = guard.begin('a');
    assert.ok(token);
    assert.equal(guard.isCurrent(read), false);
    guard.update({ ownerId: 'a', disabled: true });
    guard.update({ ownerId: 'a', disabled: false });
    assert.equal(guard.isCurrent(token), false);
    guard.finish(token);
    const last = guard.capture();
    guard.invalidate();
    assert.equal(guard.isCurrent(last), false);
  });
});

describe('GPS picker file reading', () => {
  const asset = { name: 'test.GPX', uri: 'blob:private', size: 4 };
  it('reads browser asset.file.text without constructing Expo File', async () => {
    let reads = 0;
    const result = await readGpsImportAsset({ ...asset, file: { size: 4, async text() { reads++; return 'test'; } } }, 'web', () => { throw new Error('must not construct'); });
    assert.deepEqual(result, { content: 'test', extension: 'gpx' });
    assert.equal(reads, 1);
    await assert.rejects(readGpsImportAsset(asset, 'web', () => { throw new Error('must not construct'); }), /invalid/);
  });
  it('uses the native reader and checks both declared and actual size before reading', async () => {
    let reads = 0;
    assert.deepEqual(await readGpsImportAsset(asset, 'ios', (uri) => {
      assert.equal(uri, asset.uri);
      return { size: 4, async text() { reads++; return 'test'; } };
    }), { content: 'test', extension: 'gpx' });
    assert.equal(reads, 1);
    for (const size of [GPS_IMPORT_MAX_BYTES + 1, Infinity, -1]) {
      await assert.rejects(readGpsImportAsset({ ...asset, size }, 'web', () => { throw new Error('too late'); }), /tooLarge/);
      await assert.rejects(readGpsImportAsset({ ...asset, file: { size, async text() { throw new Error('must not read'); } } }, 'web', () => { throw new Error('native'); }));
    }
    await assert.rejects(readGpsImportAsset({ ...asset, name: 'x.fit' }, 'ios', () => { throw new Error('must not construct'); }), /unsupported/);
  });
});

it('generates distinct secure import IDs even in the same millisecond', (context) => {
  context.mock.method(Date, 'now', () => 123456);
  const csv = 'timestamp,latitude,longitude\n2026-01-01T12:00:00Z,47,8\n2026-01-01T12:00:01Z,47.00004,8';
  const a = previewGpsImport(csv, 'csv', 'owner').session.id;
  const b = previewGpsImport(csv, 'csv', 'owner').session.id;
  assert.match(a, /^gps-import_[a-z0-9]+_[a-z0-9]{10}$/);
  assert.notEqual(a, b);
});

it('keeps translated GPS import keys and interpolation tokens in parity', () => {
  function translations(locale: string): Record<string, string> {
    const parsed = JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${locale}/gps.json`, import.meta.url), 'utf8')) as { import: Record<string, string> };
    return parsed.import;
  }
  const english = translations('en');
  for (const locale of ['de', 'fr', 'es', 'it', 'nl', 'pt']) {
    const translated = translations(locale);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort(), locale);
    for (const key of Object.keys(english)) {
      assert.ok(translated[key].trim(), `${locale}.${key}`);
      assert.notEqual(translated[key], english[key], `${locale}.${key}`);
      assert.deepEqual(translated[key].match(/\{\{\w+\}\}/g)?.sort(), english[key].match(/\{\{\w+\}\}/g)?.sort(), `${locale}.${key}`);
    }
  }
});

it('wires preview and saved heatmaps immediately below unknown-orientation provenance, only for populated grids', () => {
  const panel = readFileSync(new URL('../../src/features/gps/components/GpsImportPanel.tsx', import.meta.url), 'utf8');
  for (const state of ['visiblePreview', 'visibleSaved']) {
    assert.match(panel, new RegExp(`\\{t\\('gps:import.provenance'\\)\\}</Text>\\s*\\{${state}\\.session\\.heatmap\\.cells\\.length > 0 \\? <GpsHeatmap heatmap=\\{${state}\\.session\\.heatmap\\} /> : null\\}`));
  }
});
