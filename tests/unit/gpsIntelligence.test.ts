import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildGpsIntelligence, detectSprints } from '../../src/features/gps/services/gpsIntelligence.ts';
import { toLocalPoint } from '../../src/features/gps/models/GpsPointModel.ts';
import {
  calculateSessionMetrics,
  generateHeatmapGrid,
} from '../../src/features/gps/services/gpsSessionCalculator.ts';
import type { GpsPoint } from '../../src/features/gps/types.ts';

/** Player moving back and forth along a line of `depth` metres, rotated by `angle` radians. */
function track(count: number, stepMs: number, depth: number, accuracy = 5, speed = 3, angle = 0.7): GpsPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const phase = (index % 20) / 19;
    const along = (index % 40 < 20 ? phase : 1 - phase) * depth;
    const across = (index % 3) * 2;
    return {
      x: along * Math.cos(angle) - across * Math.sin(angle),
      y: along * Math.sin(angle) + across * Math.cos(angle),
      elapsedMs: index * stepMs,
      speed,
      accuracy,
      segment: 0,
    };
  });
}

describe('toLocalPoint', () => {
  it('keeps only session-local metres and elapsed time', () => {
    const origin = { latitude: 47.3769, longitude: 8.5417 };
    const point = toLocalPoint(
      origin,
      { latitude: 47.3769 + 100 / 111_195, longitude: 8.5417, elapsedMs: 12_345, speed: 4, accuracy: 6 },
      0,
    );
    assert.deepEqual(Object.keys(point).sort(), ['accuracy', 'elapsedMs', 'segment', 'speed', 'x', 'y']);
    assert.ok(Math.abs(point.y - 100) < 0.5, `y ${point.y}`);
    assert.ok(Math.abs(point.x) < 0.5, `x ${point.x}`);
    assert.equal(point.elapsedMs, 12_345);
    const serialized = JSON.stringify(point);
    assert.ok(!serialized.includes('47.37') && !serialized.includes('8.54'));
  });
});

describe('session metrics', () => {
  it('measures distance in local metres and skips jumps between frames', () => {
    const points: GpsPoint[] = [
      { x: 0, y: 0, elapsedMs: 0, speed: 3, accuracy: 5, segment: 0 },
      { x: 30, y: 40, elapsedMs: 10_000, speed: 3, accuracy: 5, segment: 0 },
      { x: 900, y: 900, elapsedMs: 20_000, speed: 3, accuracy: 5, segment: 1 },
      { x: 906, y: 908, elapsedMs: 30_000, speed: 3, accuracy: 5, segment: 1 },
    ];
    assert.equal(calculateSessionMetrics(points, 0).distanceM, 60);
  });

  it('describes the heatmap by its extent in metres, not by coordinates', () => {
    const heatmap = generateHeatmapGrid(track(150, 5000, 60));
    assert.ok(heatmap.cells.length > 0);
    assert.ok(heatmap.extent.lengthM >= 55 && heatmap.extent.lengthM <= 62, `length ${heatmap.extent.lengthM}`);
    assert.ok(!('bounds' in heatmap));
  });
});

describe('detectSprints', () => {
  it('needs at least one second above sprint speed', () => {
    const points: GpsPoint[] = [0, 500, 1000, 1500, 2000, 2500].map((offset, index) => ({
      x: 0,
      y: 0,
      elapsedMs: 60_000 + offset,
      speed: index >= 1 && index <= 3 ? 7.5 : 3,
      accuracy: 5,
      segment: 0,
    }));
    const sprints = detectSprints(points);
    assert.equal(sprints.length, 1);
    assert.equal(sprints[0].startSec, 61);
    assert.equal(sprints[0].endSec, 62);
    assert.equal(sprints[0].peakKmh, 27);
    assert.equal(detectSprints(points.slice(0, 3)).length, 0);
  });
});

describe('buildGpsIntelligence', () => {
  it('refuses to analyse short sessions', () => {
    const intel = buildGpsIntelligence(track(60, 5000, 40));
    assert.equal(intel.status, 'insufficient');
    assert.equal(intel.widthM, null);
    assert.equal(intel.bands, null);
  });

  it('withholds spatial metrics when accuracy is poor', () => {
    const intel = buildGpsIntelligence(track(150, 5000, 40, 35));
    assert.equal(intel.status, 'low_accuracy');
    assert.equal(intel.depthM, null);
    assert.ok(intel.bands);
  });

  it('measures spread along the main movement axis regardless of orientation', () => {
    const intel = buildGpsIntelligence(track(150, 5000, 60));
    assert.equal(intel.status, 'ok');
    assert.ok(intel.depthM !== null && intel.depthM >= 50 && intel.depthM <= 62, `depth ${intel.depthM}`);
    assert.ok(intel.widthM !== null && intel.widthM <= 5, `width ${intel.widthM}`);
    assert.equal(intel.bands?.jog, 100);
    assert.ok(intel.centralSharePct !== null && intel.centralSharePct > 0 && intel.centralSharePct < 100);
  });

  it('treats missing accuracy as unknown, not as precise', () => {
    const intel = buildGpsIntelligence(track(150, 5000, 60, 0));
    assert.equal(intel.sample.medianAccuracyM, null);
  });
});
