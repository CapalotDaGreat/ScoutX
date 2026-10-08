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
  test('blocks only what the server would also refuse; short clips are a supported mode', () => {
    assert.equal(buildAnalysisPreview({ durationSec: 0 }).canProceed, false);
    assert.deepEqual(buildAnalysisPreview({ durationSec: 0 }).blockers, ['too_short']);
    assert.deepEqual(buildAnalysisPreview({ durationSec: 151 * 60 }).blockers, ['too_long']);
    assert.deepEqual(buildAnalysisPreview({ durationSec: 600, fileSizeBytes: 5 * 1024 ** 3 }).blockers, ['too_large']);
    assert.equal(buildAnalysisPreview({ durationSec: 10 }).canProceed, true);
  });

  test('poor quality only warns, never blocks', () => {
    const preview = buildAnalysisPreview({
      durationSec: 90 * 60,
      // ≈ 78 kbit/s over 90 minutes: ≈ 0.02 bits per pixel per frame at 640×360 / 15 fps.
      fileSizeBytes: 50 * 1024 * 1024,
      width: 640,
      height: 360,
      frameRate: 15,
      trackSupported: false,
    });
    assert.equal(preview.canProceed, true);
    assert.deepEqual(preview.blockers, []);
    assert.deepEqual(
      [...preview.warnings].sort(),
      ['low_bitrate', 'low_frame_rate', 'low_resolution', 'track_unsupported'].sort(),
    );
    assert.equal(preview.facts.bitrateSource, 'file_average');
  });

  test('missing metadata is reported as unknown, and pixel-level checks are listed as not done', () => {
    const preview = buildAnalysisPreview({ durationSec: 600 });
    assert.deepEqual(preview.warnings, ['metadata_unavailable']);
    assert.equal(preview.facts.width, null);
    assert.equal(preview.facts.bitrate, null);
    assert.deepEqual(preview.notChecked, ['sharpness', 'lighting', 'camera_angle', 'player_visibility']);
    assert.ok(!('quality' in preview), 'no overall quality score is derived from metadata');
  });

  test('a portrait recording and a good 1080p track', () => {
    assert.ok(buildAnalysisPreview({ durationSec: 600, width: 1080, height: 1920, frameRate: 30, trackBitrate: 12_000_000 }).warnings.includes('portrait'));
    assert.deepEqual(buildAnalysisPreview({ durationSec: 600, width: 1920, height: 1080, frameRate: 30, trackBitrate: 12_000_000 }).warnings, []);
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
