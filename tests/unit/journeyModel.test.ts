import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeFootballJourney } from '../../src/features/football-journey/models/JourneyModel.ts';

function undefinedPaths(value: unknown, path = '$'): string[] {
  if (value === undefined) return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => undefinedPaths(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => undefinedPaths(item, `${path}.${key}`));
  }
  return [];
}

describe('football journey serialisation', () => {
  test('a system entry without optional fields serialises without undefined values', () => {
    const serialized = serializeFootballJourney({
      updatedAt: '2026-10-07T10:00:00.000Z',
      entries: [
        {
          id: 'entry-1',
          type: 'statistics_milestone',
          title: 'Scored 2 vs FC Rivals',
          subtitle: 'League · W',
          date: '2026-10-07',
          metadata: { goals: 2, assists: 0, minutes: 90 },
          media: [],
          source: 'system',
          createdAt: '2026-10-07T10:00:00.000Z',
          updatedAt: '2026-10-07T10:00:00.000Z',
        },
      ],
    });

    assert.deepEqual(undefinedPaths(serialized), []);
    const [entry] = serialized.entries as Array<Record<string, unknown>>;
    assert.equal(entry.title, 'Scored 2 vs FC Rivals');
    assert.equal('organization' in entry, false);
    assert.equal('endDate' in entry, false);
  });
});
