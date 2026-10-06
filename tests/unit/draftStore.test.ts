import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoredDraft,
  serializeDraft,
} from '../../src/features/today/services/draftStore.ts';

const parseName = (value: unknown) =>
  typeof value === 'object' && value !== null && typeof (value as { name?: unknown }).name === 'string'
    ? (value as { name: string })
    : null;

describe('draft persistence', () => {
  test('round-trips a valid draft with its save time', () => {
    const savedAt = new Date('2026-10-06T10:00:00Z');
    const draft = parseStoredDraft(serializeDraft({ name: 'vs Rivals' }, savedAt), parseName);
    assert.deepEqual(draft, { data: { name: 'vs Rivals' }, savedAt: savedAt.toISOString() });
  });

  test('corrupted, outdated or invalid drafts are rejected instead of crashing', () => {
    assert.equal(parseStoredDraft('{not json', parseName), null);
    assert.equal(parseStoredDraft(JSON.stringify({ version: 0, savedAt: 'x', data: {} }), parseName), null);
    assert.equal(
      parseStoredDraft(JSON.stringify({ version: 1, savedAt: '2026-10-06T10:00:00Z', data: { name: 5 } }), parseName),
      null,
    );
    assert.equal(parseStoredDraft(null, parseName), null);
  });
});
