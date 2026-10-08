import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CORRECTION_ACTIONS as SERVER_ACTIONS,
  CORRECTION_REASONS as SERVER_REASONS,
  CORRECTION_TARGET_KINDS as SERVER_KINDS,
  correctionTargetExists,
  latestCorrections as serverLatest,
  parseCorrectionRequest,
} from '../../functions/src/analysis/corrections.ts';
import {
  CORRECTION_ACTIONS,
  CORRECTION_REASONS,
  CORRECTION_TARGET_KINDS,
  disputedEventIds,
  latestCorrections,
  parseCorrection,
  type AnalysisCorrection,
} from '../../src/features/match-analysis/services/correctionModel.ts';

const base = { jobId: 'job_abcdef', targetKind: 'possible_event', targetId: 'pe_1', action: 'dismiss_false_event' };

describe('correction requests', () => {
  it('accepts only actions that fit the target kind', () => {
    assert.ok(parseCorrectionRequest(base));
    assert.equal(parseCorrectionRequest({ ...base, targetKind: 'observation' }), null, 'observations cannot be "dismissed as events"');
    assert.equal(parseCorrectionRequest({ ...base, targetKind: 'identity_frame', action: 'confirm' }), null);
    assert.ok(parseCorrectionRequest({ ...base, targetKind: 'identity_frame', targetId: 'frame_3', action: 'not_me', reason: 'not_me' }));
  });

  it('rejects malformed ids, unknown reasons and oversize notes are trimmed', () => {
    assert.equal(parseCorrectionRequest({ ...base, jobId: '../x' }), null);
    assert.equal(parseCorrectionRequest({ ...base, targetId: 'a/b' }), null);
    assert.equal(parseCorrectionRequest({ ...base, reason: 'because' }), null);
    const parsed = parseCorrectionRequest({ ...base, note: `${'x'.repeat(400)}\u0000` });
    assert.equal(parsed?.note?.length, 280);
  });

  it('a target must exist in the analysis the player was shown', () => {
    const report = { possibleEvents: [{ id: 'pe_1' }], events: [{ eventId: 'ev_1' }], evidence: [{ id: 'obs_1' }] };
    const frames = [{ id: 'frame_0' }, { index: 4 }];
    assert.equal(correctionTargetExists(report, frames, 'possible_event', 'pe_1'), true);
    assert.equal(correctionTargetExists(report, frames, 'possible_event', 'pe_2'), false);
    assert.equal(correctionTargetExists(report, frames, 'event', 'ev_1'), true);
    assert.equal(correctionTargetExists(report, frames, 'observation', 'obs_1'), true);
    assert.equal(correctionTargetExists(report, frames, 'identity_frame', 'frame_4'), true);
    assert.equal(correctionTargetExists(null, frames, 'observation', 'obs_1'), false);
  });
});

describe('correction overlay', () => {
  const record = (id: string, createdAt: string, action: AnalysisCorrection['action'], targetId = 'ev_1'): AnalysisCorrection => ({
    id,
    targetKind: 'event',
    targetId,
    action,
    reason: null,
    createdAt,
  });

  it('keeps the latest correction per target and lets withdraw clear it (same rule on both sides)', () => {
    const records = [
      record('a', '2026-10-01T10:00:00.000Z', 'confirm'),
      record('b', '2026-10-01T11:00:00.000Z', 'dismiss_false_event'),
      record('c', '2026-10-01T09:00:00.000Z', 'dispute', 'ev_2'),
      record('d', '2026-10-01T12:00:00.000Z', 'withdraw', 'ev_2'),
    ];
    const client = latestCorrections(records);
    const server = serverLatest(records.map((item) => ({ ...item })));
    assert.deepEqual([...client.keys()], ['event:ev_1']);
    assert.equal(client.get('event:ev_1')?.action, 'dismiss_false_event');
    assert.deepEqual([...server.keys()], [...client.keys()]);
    assert.deepEqual(disputedEventIds(client), ['ev_1']);
  });

  it('client and server vocabularies match', () => {
    assert.deepEqual([...CORRECTION_ACTIONS], [...SERVER_ACTIONS]);
    assert.deepEqual([...CORRECTION_REASONS], [...SERVER_REASONS]);
    assert.deepEqual([...CORRECTION_TARGET_KINDS], [...SERVER_KINDS]);
  });

  it('ignores malformed stored records', () => {
    assert.equal(parseCorrection('x', { targetKind: 'event', targetId: 'e', action: 'train_model', createdAt: 'now' }), null);
    assert.equal(parseCorrection('x', null), null);
  });
});
