import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { searchOwnedRecords, type SearchHit } from '../../src/features/global-search/services/searchIndex.ts';

const records: SearchHit[] = [
  { id: '1', kind: 'match', title: 'Ajax', subtitle: 'W 1-0', route: 'match', entityId: 'm1' },
  { id: '2', kind: 'trial', title: 'PSV', subtitle: 'accepted', route: 'trials', entityId: 't1' },
];

describe('owned search index', () => {
  test('empty query returns nothing instead of dumping every record', () => {
    assert.equal(searchOwnedRecords('  ', records).length, 0);
  });

  test('matches recorded titles and subtitles only', () => {
    assert.equal(searchOwnedRecords('ajax', records)[0]?.entityId, 'm1');
    assert.equal(searchOwnedRecords('accepted', records)[0]?.entityId, 't1');
    assert.equal(searchOwnedRecords('invented club', records).length, 0);
  });
});
