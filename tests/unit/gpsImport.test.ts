import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmGpsImport, previewGpsImport, GPS_IMPORT_MAX_BYTES } from '../../src/features/gps/services/gpsImportService.ts';

const csv = (rows: string[]) => `timestamp,latitude,longitude\n${rows.join('\n')}`;
const valid = csv(['2026-01-01T12:00:00Z,47,8', '2026-01-01T12:00:01Z,47.00004,8', '2026-01-01T12:00:02Z,47.00008,8']);
const gpxPoint = (second: number, lat: number) => `<trkpt lat="${lat}" lon="8"><time>2026-01-01T12:00:0${second}Z</time></trkpt>`;

describe('local wearable import', () => {
  it('derives metres and speeds, strips geographic fixes, clocks and file metadata', () => {
    const preview = previewGpsImport(valid, 'CSV', 'owner');
    assert.equal(preview.session.metrics.distanceM, 9);
    assert.equal(preview.session.metrics.durationSec, 2);
    assert.equal(preview.session.metrics.maxSpeedKmh, 15.8);
    assert.equal(preview.quality.accuracyUnknown, true);
    assert.equal(preview.provenance.synchronization, 'not_synchronized');
    assert.equal(preview.provenance.matchId, null);
    const encoded = JSON.stringify(preview);
    for (const forbidden of ['latitude', 'longitude', '47.00004', '12:00:01', 'filename', '"points":', '"x":', '"y":']) assert.ok(!encoded.includes(forbidden), forbidden);
  });
  it('uses proven XML parsing for GPX, including namespace prefixes', () => {
    const input = `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${gpxPoint(0, 47)}${gpxPoint(1, 47.00004)}</trkseg></trk></gpx>`;
    assert.equal(previewGpsImport(input, 'gpx', 'owner').session.metrics.distanceM, 4);
    const prefixed = input.replace(/<(\/)?(gpx|trk|trkseg|trkpt|time)(?=[ >])/g, '<$1g:$2').replace('xmlns=', 'xmlns:g=');
    assert.equal(previewGpsImport(prefixed, 'gpx', 'owner').session.metrics.pointCount, 2);
  });
  it('supports TCX tracks with position and UTC time', () => {
    const point = (second: number, latitude: number) => `<Trackpoint><Time>2026-01-01T12:00:0${second}Z</Time><Position><LatitudeDegrees>${latitude}</LatitudeDegrees><LongitudeDegrees>8</LongitudeDegrees></Position></Trackpoint>`;
    const input = `<TrainingCenterDatabase><Activities><Activity><Lap><Track>${point(0, 47)}${point(1, 47.00004)}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    assert.equal(previewGpsImport(input, 'tcx', 'owner').session.metrics.distanceM, 4);
  });
  it('does not bridge a half-time gap or merge unrelated spatial frames', () => {
    const input = csv(['2026-01-01T12:00:00Z,47,8', '2026-01-01T12:00:01Z,47.00004,8', '2026-01-01T12:15:00Z,48,9', '2026-01-01T12:15:01Z,48.00004,9']);
    const result = previewGpsImport(input, 'csv', 'owner');
    assert.equal(result.quality.gaps, 1);
    assert.equal(result.session.metrics.durationSec, 2);
    assert.equal(result.session.metrics.distanceM, 8);
    assert.deepEqual(result.session.heatmap.cells, []);
    assert.equal(result.session.intelligence, null);
    assert.deepEqual(result.session.zones, []);
  });
  it('rejects duplicate/backwards timestamps and impossible speed spikes', () => {
    const input = valid + '\n2026-01-01T12:00:02Z,47.00008,8\n2026-01-01T12:00:03Z,48,9\n2026-01-01T12:00:04Z,47.00012,8';
    const result = previewGpsImport(input, 'csv', 'owner');
    assert.equal(result.quality.rejected, 2);
    assert.equal(result.session.metrics.pointCount, 4);
    assert.ok(result.session.metrics.maxSpeedKmh < 20);
  });
  it('filters known poor accuracy and preserves unknown accuracy honestly', () => {
    const input = valid.replace('longitude\n', 'longitude,accuracy_m\n').split('\n').map((line, index) => index ? `${line},${index === 2 ? 50 : 5}` : line).join('\n');
    const result = previewGpsImport(input, 'csv', 'owner');
    assert.equal(result.quality.rejected, 1);
    assert.equal(result.quality.accuracyUnknown, false);
  });
  it('rejects ambiguous units, missing timestamps, invalid coordinates and quoted CSV', () => {
    for (const input of [valid.replace('12:00:00Z', '12:00:00'), valid.replace('47,8', '91,8'), valid.replace('47,8', ',8'), valid.replace('latitude', 'latitude_radians'), valid.replace('47,8', '"47",8')]) {
      assert.throws(() => previewGpsImport(input, 'csv', 'owner'), /invalid/);
    }
  });
  it('rejects XML recovery, external entities, missing times and unsupported containers', () => {
    for (const input of ['<gpx><trk>', '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///secret">]><gpx/>', '<gpx><trk><trkseg><trkpt lat="47" lon="8"/></trkseg></trk></gpx>']) assert.throws(() => previewGpsImport(input, 'gpx', 'owner'), /invalid/);
    for (const extension of ['fit', 'zip', 'pdf']) assert.throws(() => previewGpsImport('', extension, 'owner'), /unsupported/);
    assert.throws(() => previewGpsImport('x'.repeat(GPS_IMPORT_MAX_BYTES + 1), 'gpx', 'owner'), /tooLarge/);
  });
  it('confirmation requires the same owner and a bounded explicit label', () => {
    const preview = previewGpsImport(valid, 'csv', 'owner');
    assert.throws(() => confirmGpsImport(preview, 'other', 'Match'), /owner/);
    assert.throws(() => confirmGpsImport(preview, 'owner', ' '), /invalid/);
    assert.throws(() => confirmGpsImport(preview, 'owner', 'x'.repeat(101)), /invalid/);
    assert.equal(confirmGpsImport(preview, 'owner', ' Training ').session.matchLabel, 'Training');
    assert.equal(preview.session.matchLabel, '');
    assert.throws(() => previewGpsImport(valid, 'csv', ''), /owner/);
  });
});
