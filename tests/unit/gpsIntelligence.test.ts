import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildGpsIntelligence, detectSprints } from '../../src/features/gps/services/gpsIntelligence.ts';
import type { GpsPoint } from '../../src/features/gps/types.ts';

const M_PER_DEG_LAT = 111_195;

/** Player moving back and forth along a north-south line of `depth` metres. */
function track(count: number, stepMs: number, depth: number, accuracy = 5, speed = 3): GpsPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const phase = (index % 20) / 19;
    const along = (index % 40 < 20 ? phase : 1 - phase) * depth;
    const across = (index % 3) * 2;
    return {
      latitude: 47 + along / M_PER_DEG_LAT,
      longitude: 8 + across / (M_PER_DEG_LAT * Math.cos((47 * Math.PI) / 180)),
      timestamp: 1_000_000 + index * stepMs,
      speed,
      accuracy,
    };
  });
}

describe('detectSprints', () => {
  it('needs at least one second above sprint speed', () => {
    const points: GpsPoint[] = [0, 500, 1000, 1500, 2000, 2500].map((offset, index) => ({
      latitude: 0,
      longitude: 0,
      timestamp: offset,
      speed: index >= 1 && index <= 3 ? 7.5 : 3,
      accuracy: 5,
    }));
    const sprints = detectSprints(points);
    assert.equal(sprints.length, 1);
    assert.equal(sprints[0].startMs, 500);
    assert.equal(sprints[0].endMs, 2000);
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
