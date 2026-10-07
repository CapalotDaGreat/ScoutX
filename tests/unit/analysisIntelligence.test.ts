import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildQualityReport,
  buildStructuredCoaching,
  parseVideoSync,
  videoSecondForGps,
} from '../../src/features/match-analysis/services/analysisIntelligence.ts';
import type {
  CoachingMoment,
  MatchAnalysisEvent,
  MatchAnalysisReport,
  MatchEstimatedStats,
} from '../../src/features/match-analysis/types.ts';

const NULL_STATS: MatchEstimatedStats = {
  minutesPlayed: null,
  goals: null,
  assists: null,
  shots: null,
  shotsOnTarget: null,
  passesAttempted: null,
  passesCompleted: null,
  passCompletionPct: null,
  keyPasses: null,
  tackles: null,
  duelsWon: null,
  duelsLost: null,
  foulsCommitted: null,
  yellowCards: null,
  redCards: null,
  matchRating: null,
  cleanSheet: null,
};

function event(id: string, type: MatchAnalysisEvent['type'], status: MatchAnalysisEvent['validationStatus']): MatchAnalysisEvent {
  return {
    eventId: id,
    videoTimestampSec: 30,
    type,
    playerIdentityConfidence: 'Good',
    eventConfidence: 'Good',
    visibilityState: 'confirmed_visible',
    evidenceRefs: [],
    validationStatus: status,
  };
}

function report(overrides: Partial<MatchAnalysisReport> = {}): MatchAnalysisReport {
  return {
    headline: '',
    strengths: [],
    improvements: [],
    coachingNotes: '',
    estimatedStats: NULL_STATS,
    moments: [],
    coverage: { visiblePct: 60, likelyOffCameraPct: 30, unknownPct: 10, confidenceLabel: 'Limited', note: '' },
    evidence: [],
    pipelineStages: [
      { id: 'player-tracking', label: 'Tracking', status: 'unavailable' },
      { id: 'video-ingestion', label: 'Ingest', status: 'complete' },
    ],
    segments: [],
    availability: [],
    confidence: null,
    methodology: '',
    modelId: 'm',
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildQualityReport', () => {
  it('keeps missing confidence dimensions null and lists uncertainty from stored fields', () => {
    const quality = buildQualityReport(report(), {
      events: [event('a', 'shot', 'accepted'), event('b', 'pass', 'rejected'), event('c', 'tackle', 'needs_identity')],
    });
    assert.equal(quality.overall, 'Limited');
    assert.ok(quality.dimensions.every((item) => item.band === null));
    assert.deepEqual(quality.canTell[0], { code: 'accepted_events', count: 1 });
    const codes = quality.uncertain.map((item) => item.code);
    assert.ok(codes.includes('identity_unconfirmed'));
    assert.ok(codes.includes('cv_unavailable'));
    assert.deepEqual(quality.uncertain.find((item) => item.code === 'rejected_events'), { code: 'rejected_events', count: 1 });
    assert.deepEqual(quality.uncertain.find((item) => item.code === 'off_camera'), { code: 'off_camera', pct: 40 });
    assert.equal(quality.canTell.some((item) => item.code === 'counted_stats'), false);
  });

  it('reports confirmed identity, counted stats and weak dimensions', () => {
    const quality = buildQualityReport(
      report({
        estimatedStats: { ...NULL_STATS, goals: 1, shots: 3 },
        confidenceDimensions: {
          videoQuality: 'Good',
          playerIdentity: 'Excellent',
          cameraCoverage: 'Insufficient',
          trackingStability: 'Good',
          eventConfidence: 'Good',
          overallCoverage: 'Good',
        },
      }),
      { identityConfirmation: { state: 'confirmed', frameIds: [], confirmedAt: null } },
    );
    assert.equal(quality.overall, 'Good');
    assert.ok(quality.canTell.some((item) => item.code === 'identity_confirmed'));
    assert.deepEqual(quality.canTell.find((item) => item.code === 'counted_stats'), { code: 'counted_stats', count: 2 });
    assert.deepEqual(quality.uncertain.find((item) => item.code === 'weak_dimension'), {
      code: 'weak_dimension',
      dimension: 'cameraCoverage',
    });
  });
});

describe('buildStructuredCoaching', () => {
  const moment: CoachingMoment = {
    id: 'm1',
    timestampSec: 42,
    eventIds: ['e1', 'e2'],
    context: 'Shot from the edge of the box',
    observationKind: 'observation',
    coachingPoint: 'Open your body before receiving',
    practiceIdea: null,
    measurement: '  ',
    confidenceLabel: 'Good',
    evidenceRefs: [],
  };

  it('links to an open goal tracking the same skill using accepted events only', () => {
    const items = buildStructuredCoaching(
      [moment],
      [event('e1', 'shot', 'accepted'), event('e2', 'tackle', 'rejected')],
      [
        { id: 'g0', title: 'Tackles', metricKey: 'tackles', status: 'active' },
        { id: 'g1', title: 'More shots', metricKey: 'shots', status: 'active' },
      ],
    );
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].whyItMatters, { goalId: 'g1', goalTitle: 'More shots' });
    assert.deepEqual(items[0].evidence, { timestampSec: 42, eventTypes: ['shot'], kind: 'observation' });
    assert.equal(items[0].suggestedMetric, 'shots');
  });

  it('never invents training advice or links achieved goals', () => {
    const items = buildStructuredCoaching(
      [moment, { ...moment, id: 'm2', coachingPoint: '  ' }],
      [event('e1', 'shot', 'accepted')],
      [{ id: 'g1', title: 'More shots', metricKey: 'shots', status: 'achieved' }],
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].whyItMatters, null);
    assert.equal(items[0].howToTrain, null);
    assert.equal(items[0].howToMeasure, null);
  });
});

describe('GPS-video sync', () => {
  const sync = { gpsSessionId: 's1', gpsAnchorMs: 1_000_000, videoAnchorSec: 20, setAt: '2026-01-01T00:00:00.000Z' };

  it('parses only complete sync records', () => {
    assert.deepEqual(parseVideoSync(sync), sync);
    assert.equal(parseVideoSync({ gpsSessionId: 's1' }), null);
    assert.equal(parseVideoSync(null), null);
  });

  it('maps GPS time to video seconds and returns null outside the video', () => {
    assert.equal(videoSecondForGps(1_030_000, sync, 600), 50);
    assert.equal(videoSecondForGps(990_000, sync, 600), 10);
    assert.equal(videoSecondForGps(900_000, sync, 600), null);
    assert.equal(videoSecondForGps(2_000_000, sync, 600), null);
  });
});
