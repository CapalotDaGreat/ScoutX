import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toUserMessage } from '../../src/utils/userFacingError.ts';

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('toUserMessage', () => {
  test('maps known Firebase codes to friendly copy', () => {
    const message = toUserMessage(codedError('permission-denied', 'FirebaseError: Missing or insufficient permissions.'), 'x');
    assert.ok(!message.includes('Firebase'));
    assert.match(message, /access/);
  });

  test('never passes raw SDK or backend text through', () => {
    assert.equal(toUserMessage(codedError('functions/internal', 'INTERNAL'), 'Fallback'), 'Fallback');
    assert.equal(toUserMessage(new Error('FirebaseError: firestore/unknown'), 'Fallback'), 'Fallback');
    assert.equal(toUserMessage(new Error('OpenRouter API key is not configured.'), 'Fallback'), 'Fallback');
    assert.equal(toUserMessage('not an error', 'Fallback'), 'Fallback');
  });

  test('keeps short, safe app messages and server precondition messages', () => {
    assert.equal(toUserMessage(new Error('Pick a match video first.'), 'Fallback'), 'Pick a match video first.');
    assert.equal(
      toUserMessage(codedError('functions/failed-precondition', 'Not enough readable frames to analyze.'), 'Fallback'),
      'Not enough readable frames to analyze.',
    );
  });

  test('network failures get a connection hint', () => {
    assert.match(toUserMessage(new Error('Network request failed'), 'Fallback'), /connection/);
  });
});
