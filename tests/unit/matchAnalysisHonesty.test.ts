import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvents } from '../../src/features/match-analysis/services/eventValidation.ts';
import { metricsFromEvents } from '../../src/features/match-analysis/services/metricsFromEvents.ts';
import { answerAskThisMatch, NOT_ENOUGH_EVIDENCE } from '../../src/features/match-analysis/services/askThisMatchService.ts';
import { buildAnalysisPreview } from '../../src/features/match-analysis/services/analysisPreviewService.ts';
import { confirmIdentity, pendingIdentityConfirmation } from '../../src/features/match-analysis/services/identityConfirmation.ts';
import { canTransitionJob } from '../../src/features/match-analysis/services/jobStateMachine.ts';
import { emptyEstimatedStats, estimatedStatsToMatchLogPayload } from '../../src/features/match-analysis/types.ts';
import type { MatchFrameSample } from '../../src/features/match-analysis/types.ts';

const frames: MatchFrameSample[] = [
  { id: 'frame_0', index: 0, timestampSec: 10, storagePath: 'a', downloadUrl: 'a' },
  { id: 'frame_1', index: 1, timestampSec: 40, storagePath: 'b', downloadUrl: 'b' },
];

describe('event validation', () => {
  test('rejects events that are not bound to sampled frames', () => {
    const [event] = validateEvents(
      [{ videoTimestampSec: 900, type: 'shot', visibilityState: 'confirmed_visible', evidenceRefs: ['missing'] }],
      frames,
      confirmIdentity(['frame_0'], '2026-10-06T00:00:00.000Z'),
    );
    assert.equal(event.validationStatus, 'rejected');
  });

  test('needs identity before accepting a visible event', () => {
    const [event] = validateEvents(
      [{ videoTimestampSec: 10, type: 'shot', visibilityState: 'confirmed_visible', evidenceRefs: ['frame_0'] }],
      frames,
      pendingIdentityConfirmation(),
    );
    assert.equal(event.validationStatus, 'needs_identity');
  });

  test('dedupes nearby events of the same type', () => {
    const events = validateEvents(
      [
        { videoTimestampSec: 10, type: 'shot', visibilityState: 'confirmed_visible', evidenceRefs: ['frame_0'] },
        { videoTimestampSec: 11, type: 'shot', visibilityState: 'confirmed_visible', evidenceRefs: ['frame_0'] },
      ],
      frames,
      confirmIdentity(['frame_0'], '2026-10-06T00:00:00.000Z'),
    );
    assert.equal(events.filter((item) => item.validationStatus === 'accepted').length, 1);
    assert.equal(events.filter((item) => item.rejectionReason?.includes('Duplicate')).length, 1);
  });
});

describe('metrics from events', () => {
  test('stays null when nothing is accepted', () => {
    assert.deepEqual(metricsFromEvents([]), emptyEstimatedStats());
  });

  test('counts only accepted events and leaves other categories unknown', () => {
    const stats = metricsFromEvents([
      {
        eventId: 'e1',
        videoTimestampSec: 10,
        type: 'goal',
        playerIdentityConfidence: 'Limited',
        eventConfidence: 'Limited',
        visibilityState: 'confirmed_visible',
        evidenceRefs: ['frame_0'],
        validationStatus: 'accepted',
      },
    ]);
    assert.equal(stats.goals, 1);
    assert.equal(stats.assists, null);
    assert.equal(stats.minutesPlayed, null);
    assert.equal(stats.matchRating, null);
  });
});

describe('ask this match', () => {
  test('returns the fixed insufficient state without inventing an answer', () => {
    const result = answerAskThisMatch({
      question: 'How many passes?',
      events: [],
      evidence: [],
      coachingMoments: [],
    });
    assert.equal(result.state, 'insufficient');
    assert.equal(result.answer, NOT_ENOUGH_EVIDENCE);
  });

  test('cites stored observations that match the question', () => {
    const result = answerAskThisMatch({
      question: 'Was there a shot?',
      events: [],
      evidence: [
        {
          id: 'obs_1',
          kind: 'observation',
          label: 'Shot',
          detail: 'A shot was visible in frame_0.',
          confidence: 0.5,
        },
      ],
      coachingMoments: [],
    });
    assert.equal(result.state, 'answered');
    assert.ok(result.answer.includes('shot'));
    assert.equal(result.citations[0].evidenceId, 'obs_1');
  });
});

describe('analysis preview', () => {
  test('blocks videos that are too short instead of guessing quality', () => {
    const preview = buildAnalysisPreview({ durationSec: 10 });
    assert.equal(preview.canProceed, false);
    assert.equal(preview.quality, 'Insufficient');
  });
});

describe('job state machine', () => {
  test('does not allow jumping from uploading to complete', () => {
    assert.equal(canTransitionJob('uploading', 'complete'), false);
    assert.equal(canTransitionJob('processing', 'complete'), true);
  });
});

describe('estimated stats apply', () => {
  test('does not write zeros when counts are unknown', () => {
    const payload = estimatedStatsToMatchLogPayload(
      { date: '2026-10-01', opponent: 'FC', competition: 'League' },
      emptyEstimatedStats(),
      'notes',
    );
    assert.equal(payload, null);
  });
});
