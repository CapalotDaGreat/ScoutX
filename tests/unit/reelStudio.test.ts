import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRenderPlan,
  buildSrt,
  classifyFfmpegError,
  isMissingAudio,
  segmentArgs,
} from '../../functions/src/reelRenderPlan.ts';
import { buildClipProof } from '../../src/features/reel-studio/services/clipProof.ts';
import { buildTemplateReel, clipCategory } from '../../src/features/reel-studio/services/reelTemplates.ts';
import { EMPTY_MEDIA_FILTER, filterMedia, mediaFacets, mediaSeason } from '../../src/features/media-library/services/mediaFilters.ts';
import type { MediaItem } from '../../src/features/media-library/types.ts';
import type { MatchAnalysisJob } from '../../src/features/match-analysis/types.ts';

function media(overrides: Partial<MediaItem> & { id: string }): MediaItem {
  return {
    ownerId: 'p1',
    type: 'highlight',
    storagePath: `profiles/p1/videos/${overrides.id}/video.mp4`,
    thumbnailPath: null,
    durationSec: 20,
    sourceMatchId: null,
    sourceJobId: null,
    visibility: 'private',
    rightsState: 'unconfirmed',
    moderationState: 'none',
    uploadState: 'ready',
    processingState: 'none',
    favorite: false,
    tags: [],
    goalIds: [],
    title: overrides.id,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('render plan', () => {
  const sources = new Map([
    ['a', { storagePath: 'profiles/p1/a.mp4', durationSec: 20 }],
    ['b', { storagePath: 'profiles/p1/b.mp4', durationSec: 0 }],
  ]);

  it('plans segments in order with cumulative captions and the chosen cover', () => {
    const result = buildRenderPlan(
      {
        segments: [
          { mediaId: 'a', inSec: 2, outSec: 6, caption: 'Run in behind' },
          { mediaId: 'b', inSec: 0, outSec: 3 },
          { mediaId: 'a', inSec: 10, outSec: 12, caption: 'Finish' },
        ],
        aspectRatio: '16:9',
        coverMediaId: 'b',
      },
      sources,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.width, 1920);
    assert.equal(result.plan.height, 1080);
    assert.equal(result.plan.totalSec, 9);
    assert.equal(result.plan.coverIndex, 1);
    assert.match(result.plan.srt ?? '', /^1\n00:00:00,000 --> 00:00:04,000\nRun in behind\n/);
    assert.match(result.plan.srt ?? '', /2\n00:00:07,000 --> 00:00:09,000\nFinish/);
  });

  it('rejects missing sources, invalid trims and over-long reels with typed codes', () => {
    const plan = (segments: Array<{ mediaId: string; inSec: number; outSec: number }>) =>
      buildRenderPlan({ segments, aspectRatio: '9:16', coverMediaId: null }, sources);
    assert.deepEqual(plan([]), { ok: false, code: 'no_segments' });
    assert.deepEqual(plan([{ mediaId: 'x', inSec: 0, outSec: 1 }]), { ok: false, code: 'missing_source', segmentIndex: 0 });
    assert.deepEqual(plan([{ mediaId: 'a', inSec: 3, outSec: 3 }]), { ok: false, code: 'invalid_clip', segmentIndex: 0 });
    assert.deepEqual(plan([{ mediaId: 'a', inSec: 0, outSec: 25 }]), { ok: false, code: 'invalid_clip', segmentIndex: 0 });
    assert.equal(plan([{ mediaId: 'b', inSec: 0, outSec: 60 }]).ok, true, 'unknown source duration is not checked');
    assert.deepEqual(plan([{ mediaId: 'b', inSec: 0, outSec: 60 }, { mediaId: 'b', inSec: 0, outSec: 40 }]), { ok: false, code: 'too_long' });
  });

  it('builds ffmpeg arguments and classifies failures', () => {
    const withAudio = segmentArgs('in.mp4', 'out.mp4', { startSec: 1, durationSec: 2 }, { width: 1080, height: 1920 }, true);
    assert.ok(withAudio.includes('0:a:0'));
    assert.ok(withAudio.join(' ').includes('scale=1080:1920:force_original_aspect_ratio=decrease'));
    const silent = segmentArgs('in.mp4', 'out.mp4', { startSec: 1, durationSec: 2 }, { width: 1080, height: 1920 }, false);
    assert.ok(silent.includes('anullsrc=r=48000:cl=stereo'));
    assert.equal(isMissingAudio("Stream map '0:a:0' matches no streams."), true);
    assert.equal(classifyFfmpegError('in.mp4: Invalid data found when processing input'), 'unsupported_codec');
    assert.equal(classifyFfmpegError('in.mp4: No such file or directory'), 'missing_source');
    assert.equal(classifyFfmpegError('something else'), 'render_failed');
    assert.equal(buildSrt([{ index: 0, mediaId: 'a', storagePath: '', startSec: 0, durationSec: 2, caption: '  ' }]), null);
  });
});

describe('reel templates', () => {
  const items = [
    media({ id: 'g1', category: 'goals', durationSec: 30, createdAt: '2026-01-01' }),
    media({ id: 'g2', tags: ['Goals'], durationSec: 8, createdAt: '2026-02-01' }),
    media({ id: 'd1', category: 'defending' }),
    media({ id: 'u1' }),
    media({ id: 'f1', category: 'skills', uploadState: 'failed' }),
  ];

  it('never guesses a category for untagged clips', () => {
    assert.equal(clipCategory(media({ id: 'x', tags: ['clutch'] })), null);
    const scout = buildTemplateReel('scout', items, null);
    assert.equal(scout.ok, true);
    if (!scout.ok) return;
    assert.deepEqual(scout.segments.map((s) => s.mediaId), ['g2', 'g1', 'd1']);
    assert.equal(scout.segments[1].outSec, 12);
    assert.equal(scout.untagged, 1);
    assert.equal(scout.template.aspectRatio, '16:9');
  });

  it('caps social reels at 30 seconds and needs a position for the position template', () => {
    const social = buildTemplateReel('social', items, null);
    assert.equal(social.ok, true);
    if (social.ok) {
      assert.ok(social.totalSec <= 30);
      assert.ok(social.segments.every((s) => s.outSec <= 6));
      assert.equal(social.segments.every((s) => s.caption === undefined), true);
    }
    assert.deepEqual(buildTemplateReel('position', items, null), { ok: false, reason: 'position_unknown', untagged: 1 });
    const defender = buildTemplateReel('position', items, 'defender');
    assert.equal(defender.ok && defender.segments[0].mediaId, 'd1');
    assert.equal(buildTemplateReel('scout', [media({ id: 'u' })], null).ok, false);
  });
});

describe('clip proof', () => {
  const job = {
    id: 'job1',
    match: { opponent: 'Rangers', competition: 'League', date: '2026-03-01' },
    events: [
      { eventId: 'e1', type: 'shot', validationStatus: 'accepted', videoTimestampSec: 42 },
      { eventId: 'e2', type: 'tackle', validationStatus: 'rejected', videoTimestampSec: 80 },
    ],
  } as unknown as MatchAnalysisJob;

  it('traces clips to match and event status without inventing links', () => {
    const linked = media({ id: 'm', sourceJobId: 'job1' });
    assert.equal(buildClipProof({ mediaId: 'x', inSec: 0, outSec: 1 }, undefined, undefined).state, 'source_missing');
    assert.equal(buildClipProof({ mediaId: 'm', inSec: 0, outSec: 1 }, media({ id: 'm' }), undefined).state, 'unlinked');
    assert.equal(buildClipProof({ mediaId: 'm', inSec: 0, outSec: 1 }, linked, job).state, 'match_linked');
    const accepted = buildClipProof({ mediaId: 'm', inSec: 40, outSec: 45, evidenceId: 'e1' }, linked, job);
    assert.deepEqual(
      { state: accepted.state, type: accepted.eventType, at: accepted.eventTimestampSec, match: accepted.matchLabel },
      { state: 'event_accepted', type: 'shot', at: 42, match: 'Rangers' },
    );
    assert.equal(buildClipProof({ mediaId: 'm', inSec: 0, outSec: 1, evidenceId: 'e2' }, linked, job).state, 'event_rejected');
    assert.equal(buildClipProof({ mediaId: 'm', inSec: 0, outSec: 1, evidenceId: 'gone' }, linked, job).state, 'event_missing');
  });
});

describe('media filters', () => {
  const items = [
    media({ id: 'a', visibility: 'passport', recordedAt: '2025-09-10', matchLabel: 'Rangers', category: 'goals' }),
    media({ id: 'b', goalIds: ['g1'], recordedAt: '2026-03-01', matchLabel: 'Celtic' }),
    media({ id: 'c', createdAt: '2026-08-15T00:00:00.000Z' }),
  ];

  it('derives seasons from the recorded date and filters by every dimension', () => {
    assert.equal(mediaSeason(items[0]), '2025/26');
    assert.equal(mediaSeason(items[2]), '2026/27');
    const facets = mediaFacets(items);
    assert.deepEqual(facets.seasons, ['2026/27', '2025/26']);
    assert.deepEqual(facets.matches.map((m) => m.label), ['Rangers', 'Celtic']);
    const ids = (filter: Partial<typeof EMPTY_MEDIA_FILTER>, evidence: string[] = []) =>
      filterMedia(items, { ...EMPTY_MEDIA_FILTER, ...filter }, new Set(evidence)).map((item) => item.id);
    assert.deepEqual(ids({}), ['a', 'b', 'c']);
    assert.deepEqual(ids({ passport: true }), ['a']);
    assert.deepEqual(ids({ goalLinked: true }), ['b']);
    assert.deepEqual(ids({ season: '2025/26' }), ['a', 'b']);
    assert.deepEqual(ids({ match: 'Celtic' }), ['b']);
    assert.deepEqual(ids({ category: 'goals' }), ['a']);
    assert.deepEqual(ids({ sentAsEvidence: true }, ['c']), ['c']);
  });
});
