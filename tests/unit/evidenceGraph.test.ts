import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEvidenceItem,
  serializeEvidenceItem,
} from '../../src/features/evidence/models/EvidenceItemModel.ts';
import { provenancedValue, unknownValue } from '../../src/features/evidence/types.ts';

const base = {
  id: 'ev-1',
  ownerId: 'player-1',
  kind: 'video',
  provenance: 'self_reported',
  state: 'available',
  title: 'Goal vs FC Rivals',
  createdAt: '2026-10-01T10:00:00.000Z',
  refs: [
    { kind: 'match_log', id: 'match-1' },
    { kind: 'video', id: 'clip-1', locator: '00:42' },
    { kind: 'goal', id: 'goal-1', label: 'Finishing' },
  ],
};

describe('evidence graph', () => {
  test('links from evidence to its match, clip and goal survive a round trip', () => {
    const parsed = parseEvidenceItem(base);
    assert.ok(parsed);
    assert.deepEqual(
      parsed.refs.map((ref) => `${ref.kind}:${ref.id}`),
      ['match_log:match-1', 'video:clip-1', 'goal:goal-1'],
    );
    assert.equal(parsed.refs[1]?.locator, '00:42');

    const reparsed = parseEvidenceItem(serializeEvidenceItem(parsed));
    assert.deepEqual(reparsed, parsed);
  });

  test('invalid links are dropped instead of guessed', () => {
    const parsed = parseEvidenceItem({
      ...base,
      refs: [{ kind: 'match_log', id: '' }, { kind: 'spaceship', id: 'x' }, 'match-2', { kind: 'reel', id: 'reel-1' }],
    });
    assert.deepEqual(parsed?.refs, [{ kind: 'reel', id: 'reel-1' }]);
  });

  test('missing provenance, state and confidence stay unknown', () => {
    const parsed = parseEvidenceItem({ ...base, provenance: 'trust me', state: undefined, confidence: 'certain' });
    assert.equal(parsed?.provenance, 'unknown');
    assert.equal(parsed?.state, 'unknown');
    assert.equal(parsed?.confidence, null);
    assert.equal(parsed?.occurredAt, null);
    assert.equal(parsed?.visibility, 'private');
  });

  test('items without identity, kind or creation date are rejected', () => {
    assert.equal(parseEvidenceItem({ ...base, ownerId: undefined }), null);
    assert.equal(parseEvidenceItem({ ...base, kind: 'rumour' }), null);
    assert.equal(parseEvidenceItem({ ...base, createdAt: 'yesterday' }), null);
  });

  test('a null value is insufficient evidence, never a default', () => {
    assert.deepEqual(unknownValue<number>(), {
      value: null,
      provenance: 'unknown',
      state: 'unknown',
      confidence: null,
      asOf: null,
      refs: [],
    });
    const missing = provenancedValue<number>(null, 'self_reported', { confidence: 'high' });
    assert.equal(missing.state, 'insufficient');
    assert.equal(missing.confidence, null);
  });
});
