import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertWithinLimit,
  isRetryableUploadError,
  retryDelayMs,
  UPLOAD_LIMITS,
  UploadTooLargeError,
} from '../../src/firebase/uploadPolicy.ts';
import { toUserMessage } from '../../src/utils/userFacingError.ts';

describe('upload policy', () => {
  it('retries only transient storage failures', () => {
    assert.equal(isRetryableUploadError({ code: 'storage/retry-limit-exceeded' }), true);
    assert.equal(isRetryableUploadError({ code: 'storage/unknown' }), true);
    assert.equal(isRetryableUploadError({ code: 'storage/unauthorized' }), false);
    assert.equal(isRetryableUploadError({ code: 'storage/canceled' }), false);
    assert.equal(isRetryableUploadError(new Error('boom')), false);
  });

  it('backs off exponentially with a cap', () => {
    assert.deepEqual([0, 1, 2, 3, 10].map(retryDelayMs), [1000, 2000, 4000, 8000, 15000]);
  });

  it('rejects files over the storage-rule limit before uploading', () => {
    assert.doesNotThrow(() => assertWithinLimit(UPLOAD_LIMITS.highlightVideo, UPLOAD_LIMITS.highlightVideo));
    assert.doesNotThrow(() => assertWithinLimit(10, undefined));
    assert.throws(
      () => assertWithinLimit(UPLOAD_LIMITS.highlightVideo + 1, UPLOAD_LIMITS.highlightVideo),
      (error: unknown) => error instanceof UploadTooLargeError && error.code === 'upload_too_large',
    );
    const message = toUserMessage(new UploadTooLargeError(200 * 1024 * 1024, UPLOAD_LIMITS.highlightVideo), 'fallback');
    assert.match(message, /too large/);
  });
});
