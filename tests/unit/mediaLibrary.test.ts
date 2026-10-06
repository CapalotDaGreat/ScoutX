import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { featuredMediaIdsFromHighlights, highlightVideoToMediaItem } from '../../src/features/media-library/services/mediaMigration.ts';
import { buildReelQualityNotes, canApproveReel } from '../../src/features/reel-studio/services/reelQuality.ts';
import { moveSegment, sequenceReelSegments, trimSegment } from '../../src/features/reel-studio/services/reelSequencing.ts';
import type { HighlightVideo } from '../../src/features/highlight-videos/types.ts';
import type { ReelManifest } from '../../src/features/reel-studio/types.ts';

function video(overrides: Partial<HighlightVideo> = {}): HighlightVideo {
  return {
    id: 'v1',
    title: 'Goal',
    tags: ['goal'],
    category: 'goals',
    date: '2026-10-01',
    durationSec: 12,
    videoUrl: 'https://example.invalid/token',
    thumbnailUrl: 'https://example.invalid/thumb',
    storagePath: 'profiles/u1/videos/v1/video.mp4',
    thumbnailStoragePath: 'profiles/u1/videos/v1/thumb.jpg',
    featured: true,
    sortOrder: 0,
    uploadStatus: 'ready',
    analysis: { status: 'none' },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('media migration', () => {
  test('drops token URLs and keeps storage paths', () => {
    const item = highlightVideoToMediaItem(video(), 'u1');
    assert.equal(item.storagePath, 'profiles/u1/videos/v1/video.mp4');
    assert.equal('videoUrl' in item, false);
    assert.equal(item.visibility, 'passport');
  });

  test('featured ids only include ready featured clips', () => {
    assert.deepEqual(
      featuredMediaIdsFromHighlights([
        video({ id: 'a', featured: true, uploadStatus: 'ready' }),
        video({ id: 'b', featured: true, uploadStatus: 'failed' }),
        video({ id: 'c', featured: false, uploadStatus: 'ready' }),
      ]),
      ['a'],
    );
  });
});

describe('reel quality and sequencing', () => {
  test('cannot approve a reel with empty clips or pending suggestions', () => {
    const reel: Pick<ReelManifest, 'segments' | 'coverMediaId' | 'title' | 'aiSuggestions'> = {
      title: '',
      coverMediaId: null,
      segments: [],
      aiSuggestions: [{ segmentIndex: 0, reason: 'maybe a shot', decision: 'pending' }],
    };
    const notes = buildReelQualityNotes(reel);
    assert.ok(notes.some((note) => note.code === 'no_segments'));
    assert.equal(canApproveReel(notes), false);
  });

  test('sequence reports overlaps without inventing new trims', () => {
    const sequenced = sequenceReelSegments([
      { mediaId: 'm1', inSec: 10, outSec: 20 },
      { mediaId: 'm2', inSec: 15, outSec: 25 },
    ]);
    assert.equal(sequenced.overlapCount, 1);
    assert.equal(sequenced.totalDurationSec, 20);
    assert.deepEqual(moveSegment(sequenced.segments, 1, 0).map((item) => item.mediaId), ['m2', 'm1']);
    assert.equal(trimSegment(sequenced.segments[0], 12, 18).inSec, 12);
  });
});
