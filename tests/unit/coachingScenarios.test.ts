import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessCoachingSufficiency,
  buildStructuredCoaching,
} from '../../src/features/match-analysis/services/analysisIntelligence.ts';
import type {
  CoachingMoment,
  MatchAnalysisEvent,
  MatchAnalysisReport,
  MatchEstimatedStats,
  MatchEventType,
  MatchEventValidationStatus,
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

function baseReport(partial: Partial<MatchAnalysisReport> = {}): MatchAnalysisReport {
  return {
    headline: '',
    strengths: [],
    improvements: [],
    coachingNotes: '',
    estimatedStats: NULL_STATS,
    moments: [],
    coverage: {
      visiblePct: 40,
      likelyOffCameraPct: 30,
      unknownPct: 30,
      confidenceLabel: 'Limited',
      note: '',
    },
    evidence: [],
    events: [],
    coachingMoments: [],
    pipelineStages: [],
    segments: [],
    availability: [],
    confidenceDimensions: null,
    tacticalSummary: undefined,
    confidence: null,
    methodology: '',
    modelId: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as MatchAnalysisReport;
}

function moment(partial: Partial<CoachingMoment> & Pick<CoachingMoment, 'id' | 'coachingPoint'>): CoachingMoment {
  return {
    timestampSec: 30,
    eventIds: ['e1'],
    context: 'Received under pressure',
    observationKind: 'observation',
    practiceIdea: 'Receive on the half-turn, 2×8 minutes',
    measurement: 'Successful receives in the next match',
    confidenceLabel: 'Good',
    evidenceRefs: [],
    ...partial,
  };
}

function event(
  id: string,
  type: MatchEventType,
  status: MatchEventValidationStatus,
): MatchAnalysisEvent {
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

describe('coaching scenario evaluations', () => {
  it('strong performance: ready coaching keeps drill + measurement and links a goal', () => {
    const report = baseReport({
      coachingMoments: [
        moment({
          id: 'm-strong',
          context: 'Completed a progressive pass after scanning',
          coachingPoint: 'Keep scanning before the first touch under less pressure too',
        }),
      ],
      events: [event('e1', 'pass', 'accepted')],
      coverage: {
        visiblePct: 70,
        likelyOffCameraPct: 10,
        unknownPct: 20,
        confidenceLabel: 'Good',
        note: '',
      },
    });
    const sufficiency = assessCoachingSufficiency(report, {
      identityConfirmation: { state: 'confirmed', frameIds: ['f1'], confirmedAt: '2026-01-01' },
      moments: report.coachingMoments,
    });
    assert.equal(sufficiency.ready, true);
    const items = buildStructuredCoaching(report.coachingMoments!, report.events!, [
      { id: 'g1', title: 'Cleaner first touches', metricKey: 'passAccuracy', status: 'active' },
    ]);
    assert.equal(items.length, 1);
    assert.ok(items[0]!.whatToImprove.length > 0);
    assert.equal(items[0]!.howToTrain, 'Receive on the half-turn, 2×8 minutes');
    assert.equal(items[0]!.howToMeasure, 'Successful receives in the next match');
    assert.deepEqual(items[0]!.whyItMatters, { goalId: 'g1', goalTitle: 'Cleaner first touches' });
  });

  it('weak performance: honest improvement point without inventing a drill', () => {
    const report = baseReport({
      coachingMoments: [
        moment({
          id: 'm-weak',
          coachingPoint: 'You lost the ball facing your own goal twice',
          practiceIdea: null,
          measurement: null,
          confidenceLabel: 'Limited',
        }),
      ],
      events: [event('e1', 'tackle', 'accepted')],
    });
    const items = buildStructuredCoaching(report.coachingMoments!, report.events!, []);
    assert.equal(items.length, 1);
    assert.match(items[0]!.whatToImprove, /lost the ball/i);
    assert.equal(items[0]!.howToTrain, null);
    assert.equal(items[0]!.howToMeasure, null);
  });

  it('mixed performance: keeps only moments with a coaching point', () => {
    const items = buildStructuredCoaching(
      [
        moment({ id: 'm1', coachingPoint: 'Hold the wide channel longer' }),
        moment({ id: 'm2', coachingPoint: '   ' }),
      ],
      [event('e1', 'pass', 'accepted')],
      [],
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.id, 'm1');
  });

  it('sparse / uncertain evidence: not ready, concrete next step', () => {
    const report = baseReport({
      coachingMoments: [],
      coverage: {
        visiblePct: 5,
        likelyOffCameraPct: 50,
        unknownPct: 45,
        confidenceLabel: 'Insufficient',
        note: '',
      },
    });
    const result = assessCoachingSufficiency(report, {
      identityConfirmation: { state: 'confirmed', frameIds: ['f1'], confirmedAt: '2026-01-01' },
    });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'no_moments');
    assert.match(result.nextStep, /anchor|clip|frame/i);
  });

  it('missing identity: blocks personalized coaching', () => {
    const report = baseReport({
      coachingMoments: [moment({ id: 'm1', coachingPoint: 'Should not surface' })],
      events: [event('e1', 'shot', 'accepted')],
    });
    const result = assessCoachingSufficiency(report, {
      identityConfirmation: { state: 'pending', frameIds: [], confirmedAt: null },
    });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'identity_unconfirmed');
  });

  it('rejected identity: still blocked', () => {
    const report = baseReport({
      coachingMoments: [moment({ id: 'm1', coachingPoint: 'Should not surface' })],
    });
    const result = assessCoachingSufficiency(report, {
      identityConfirmation: { state: 'rejected', frameIds: [], confirmedAt: null },
    });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'identity_unconfirmed');
  });

  it('contradictory model path: rejected events do not ground coaching links', () => {
    const items = buildStructuredCoaching(
      [moment({ id: 'm1', coachingPoint: 'Shoot earlier', eventIds: ['e-bad'] })],
      [event('e-bad', 'shot', 'rejected')],
      [{ id: 'g1', title: 'More shots', metricKey: 'shots', status: 'active' }],
    );
    assert.equal(items[0]!.evidence.eventTypes.length, 0);
    assert.equal(items[0]!.whyItMatters, null);
    assert.equal(items[0]!.suggestedMetric, null);
  });

  it('provider / coverage failure style: low visibility without accepted events', () => {
    const report = baseReport({
      coachingMoments: [moment({ id: 'm1', coachingPoint: 'Stay higher' })],
      events: [],
      coverage: {
        visiblePct: 8,
        likelyOffCameraPct: 60,
        unknownPct: 32,
        confidenceLabel: 'Insufficient',
        note: '',
      },
    });
    const result = assessCoachingSufficiency(report, {
      identityConfirmation: { state: 'confirmed', frameIds: ['f1'], confirmedAt: '2026-01-01' },
      moments: report.coachingMoments,
    });
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'coverage_insufficient');
  });
});
