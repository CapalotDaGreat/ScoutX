import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardEvidenceCount,
  discoveryColumns,
  playerImageKey,
  playerInitials,
} from '../../src/components/player-card/playerCardPresentation.ts';

describe('player card presentation', () => {
  test('discovery grid protects readable mobile cards and uses wider desktop space', () => {
    for (const width of [320, 390, 768, 1099, NaN, Infinity]) assert.equal(discoveryColumns(width), 1);
    for (const width of [1100, 1440, 1920]) assert.equal(discoveryColumns(width), 2);
  });
  test('initials handle missing, long, single and Unicode names without splitting surrogate pairs', () => {
    assert.equal(playerInitials('   '), '?');
    assert.equal(playerInitials('  Alex   Morgan  '), 'AM');
    assert.equal(playerInitials('Alex Very Long Middle Name Morgan'), 'AM');
    assert.equal(playerInitials('alex'), 'AL');
    assert.equal(playerInitials('\u{10400} Smith'), '\u{10400}S');
  });

  test('image attempt key changes for player or URL changes, not whitespace', () => {
    const original = playerImageKey('one', 'https://example.test/avatar.jpg');
    assert.notEqual(original, playerImageKey('two', 'https://example.test/avatar.jpg'));
    assert.notEqual(original, playerImageKey('one', 'https://example.test/new.jpg'));
    assert.equal(original, playerImageKey('one', ' https://example.test/avatar.jpg '));
    assert.notEqual(original, playerImageKey('one', ''));
    assert.notEqual(playerImageKey('a:b', 'c'), playerImageKey('a', 'b:c'));
  });

  test('evidence counts preserve real zero and reject invalid statistics without fabricating replacements', () => {
    assert.equal(cardEvidenceCount(0), 0);
    assert.equal(cardEvidenceCount(12), 12);
    for (const value of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(cardEvidenceCount(value), null);
    }
  });
});
