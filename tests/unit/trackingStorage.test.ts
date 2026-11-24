import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { encodeTrackingStorage, decodeTrackingStorage } from '../../functions/src/analysis/trackingStorage.ts';
import { decodeTrackingStorage as appDecode } from '../../src/features/match-analysis/services/trackingStorage.ts';
import { parseTrackingReport, answerTarget } from '../../functions/src/analysis/trackingV3.ts';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/tracking50-img4809-auto.json', import.meta.url), 'utf8'));
function document() {
  const report = parseTrackingReport(fixture.report, fixture.timeline)!;
  assert.ok(report.stateStrip.length > 0 && report.moments.some((m) => m.indicator.length));
  return { version: 7, stale: false, feedbackRevision: 2, report, followUp: { status: 'done', round: 1 } };
}
function noNestedArrays(value: unknown, inArray = false): void {
  if (Array.isArray(value)) {
    assert.equal(inArray, false, 'array directly inside array is not Firestore-compatible');
    value.forEach((item) => noNestedArrays(item, true));
  } else if (value && typeof value === 'object') Object.values(value).forEach((item) => noNestedArrays(item));
}

test('server and app storage codecs remain byte-identical', () => {
  assert.equal(readFileSync(new URL('../../functions/src/analysis/trackingStorage.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../../src/features/match-analysis/services/trackingStorage.ts', import.meta.url), 'utf8'));
});

test('populated recorded indicators and state strips round-trip exactly through server and app', () => {
  const doc = document(); const before = structuredClone(doc);
  const stored = encodeTrackingStorage(doc);
  assert.equal(stored.tupleEncoding, 'pitchproof.tracking.tuples.v1');
  noNestedArrays(stored);
  const persisted = JSON.parse(JSON.stringify(stored));
  assert.deepEqual(decodeTrackingStorage(persisted), doc);
  assert.deepEqual(appDecode(persisted), doc);
  assert.deepEqual(doc, before, 'writer must not mutate the validated report');
  assert.deepEqual(answerTarget((decodeTrackingStorage(persisted).report as typeof doc.report), doc.report.moments[0].id),
    answerTarget(doc.report, doc.report.moments[0].id), 'identity-answer points remain tuples in server memory');
});

test('named stored rows preserve tuple ordering, float precision, image paths and other report facts', () => {
  const doc = { report: { stateStrip: [[0, 1.123456789, 'UNKNOWN']],
    moments: [{ id: 'm', indicator: [[0.123456789, 0.1, 0.2, 0.3, 0.4]], imagePath: 'owner/path.jpg' }] } };
  assert.deepEqual(encodeTrackingStorage(doc).report, {
    stateStrip: [{ start: 0, end: 1.123456789, state: 'UNKNOWN' }],
    moments: [{ id: 'm', indicator: [{ t: 0.123456789, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }], imagePath: 'owner/path.jpg' }],
  });
  assert.deepEqual(appDecode(encodeTrackingStorage(doc)), doc);
});

test('discovery indicators survive decode/merge/re-encode with legacy sightings', () => {
  const legacy = { moments: [{ id: 'd1', indicator: [[1, 0.2, 0.3, 0.1, 0.5]] }], generation: 1, updatedAt: 'now' };
  const stored = encodeTrackingStorage(legacy);
  assert.deepEqual(appDecode(stored), legacy);
  const decoded = decodeTrackingStorage(stored) as typeof legacy;
  const merged = { ...decoded, moments: [...decoded.moments, { id: 'd2', indicator: [[2, 0.4, 0.3, 0.1, 0.5]] }] };
  noNestedArrays(encodeTrackingStorage(merged));
  assert.deepEqual(appDecode(encodeTrackingStorage(merged)), merged);
  assert.deepEqual(appDecode(legacy), legacy);
});

test('legacy, null, absent and empty optional fields keep their semantics', () => {
  for (const doc of [{ report: null }, { version: 1 }, { report: { stateStrip: [], moments: [] } }, { moments: [] }]) {
    assert.deepEqual(decodeTrackingStorage(encodeTrackingStorage(doc)), doc);
    assert.deepEqual(appDecode(doc), doc);
  }
  assert.deepEqual(appDecode(document()), document());
});

for (const row of [[1, 2], [1, 2, 3, 4, NaN], { t: 1, x: 2, y: 3, w: 4 }, null]) {
  test(`malformed indicator row fails closed: ${JSON.stringify(row)}`, () => {
    assert.throws(() => appDecode({ moments: [{ indicator: [row] }] }), /Invalid tracking/);
  });
}

test('unknown encoding, invalid state strip and non-document payload fail closed', () => {
  assert.throws(() => appDecode({ tupleEncoding: 'future-v2' }), /Unknown/);
  for (const stateStrip of [[[0, 1, 'BOGUS']], [[0, Infinity, 'UNKNOWN']], [{ start: 0, state: 'UNKNOWN' }], 'bad']) {
    assert.throws(() => appDecode({ report: { stateStrip } }), /Invalid/);
  }
  assert.throws(() => appDecode(null), /Invalid/);
});
