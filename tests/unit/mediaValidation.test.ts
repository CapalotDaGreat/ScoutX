import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  MEDIA_LIMITS,
  evaluateProbe,
  hasVideoMagicBytes,
  parseFrameRate,
  parseProbeJson,
} from '../../functions/src/uploads/probe.ts';
import { UPLOAD_REJECTION_REASONS } from '../../src/features/media-upload/types.ts';

const SIZE = 10_000_000;

function probe(overrides: { format?: Record<string, unknown>; video?: Record<string, unknown>; extra?: Record<string, unknown>[] } = {}) {
  return {
    format: {
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: '5400.0',
      size: String(SIZE),
      bit_rate: '8000000',
      tags: { major_brand: 'qt  ' },
      ...overrides.format,
    },
    streams: [
      { codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080, avg_frame_rate: '30000/1001', ...overrides.video },
      { codec_type: 'audio', codec_name: 'aac' },
      ...(overrides.extra ?? []),
    ],
  };
}

const reasonOf = (value: ReturnType<typeof evaluateProbe>) => (value.ok ? 'ok' : value.reason);

describe('magic bytes', () => {
  it('accepts ISO BMFF / QuickTime leading atoms only', () => {
    const atom = (name: string) => new Uint8Array([0, 0, 0, 0x20, ...Buffer.from(name), 0, 0, 0, 0]);
    assert.equal(hasVideoMagicBytes(atom('ftyp')), true);
    assert.equal(hasVideoMagicBytes(atom('wide')), true);
    assert.equal(hasVideoMagicBytes(new Uint8Array(Buffer.from('89504e470d0a1a0a00000000', 'hex'))), false);
    assert.equal(hasVideoMagicBytes(new Uint8Array(4)), false);
  });
});

describe('ffprobe evaluation', () => {
  it('accepts a typical iPhone HEVC recording and summarizes it', () => {
    const result = evaluateProbe(probe(), SIZE);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.summary.container, 'mov');
      assert.equal(result.summary.fps, 29.97);
      assert.equal(result.summary.durationSec, 5400);
      assert.equal(result.summary.audioCodec, 'aac');
    }
    const mp4 = evaluateProbe(probe({ format: { tags: { major_brand: 'isom' } } }), SIZE);
    assert.equal(mp4.ok && mp4.summary.container, 'mp4');
  });

  it('rejects each limit with a specific reason', () => {
    const cases: [ReturnType<typeof probe> | null, string][] = [
      [null, 'probe_failed'],
      [probe({ format: { format_name: 'matroska,webm' } }), 'unsupported_container'],
      [probe({ video: { codec_name: 'vp9' } }), 'unsupported_codec'],
      [probe({ video: { codec_type: 'data' } }), 'no_video_stream'],
      [probe({ format: { duration: '0.4' } }), 'too_short'],
      [probe({ format: { duration: String(MEDIA_LIMITS.maxDurationSec + 1) } }), 'too_long'],
      [probe({ video: { width: 64, height: 64 } }), 'resolution'],
      [probe({ video: { width: 10000, height: 4000 } }), 'resolution'],
      [probe({ video: { avg_frame_rate: '480/1' } }), 'frame_rate'],
      [probe({ video: { avg_frame_rate: '0/0', r_frame_rate: '0/0' } }), 'frame_rate'],
      [probe({ format: { bit_rate: String(MEDIA_LIMITS.maxBitRate + 1) } }), 'bitrate'],
      [probe({ format: { size: '123' } }), 'size_mismatch'],
      [probe({ extra: [{ codec_type: 'audio', codec_name: 'aac' }] }), 'ok'],
      [{ ...probe(), streams: [{ codec_type: 'audio', codec_name: 'wmav2' }, ...probe().streams] }, 'unsupported_codec'],
    ];
    for (const [input, expected] of cases) {
      assert.equal(reasonOf(evaluateProbe(input, SIZE)), expected, JSON.stringify(input?.format ?? input));
    }
  });

  it('ignores cover-art pictures when counting video streams', () => {
    const coverOnly = probe({ video: { disposition: { attached_pic: 1 } } });
    assert.equal(reasonOf(evaluateProbe(coverOnly, SIZE)), 'no_video_stream');
    const tooMany = probe({
      extra: [
        { codec_type: 'video', codec_name: 'h264', width: 640, height: 360, avg_frame_rate: '30/1' },
        { codec_type: 'video', codec_name: 'h264', width: 640, height: 360, avg_frame_rate: '30/1' },
      ],
    });
    assert.equal(reasonOf(evaluateProbe(tooMany, SIZE)), 'too_many_streams');
  });

  it('parses frame rates and malformed JSON defensively', () => {
    assert.equal(parseFrameRate('60/1'), 60);
    assert.equal(parseFrameRate('25'), 25);
    assert.equal(parseFrameRate('1/0'), null);
    assert.equal(parseProbeJson('not json'), null);
  });
});

describe('client/server sync', () => {
  it('lists every server rejection reason on the client', () => {
    const source = readFileSync(new URL('../../functions/src/uploads/probe.ts', import.meta.url), 'utf8');
    const block = /export type RejectionReason =([\s\S]*?);/.exec(source)?.[1] ?? '';
    const server = [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
    assert.deepEqual([...UPLOAD_REJECTION_REASONS].sort(), server);
  });

  it('has copy for every rejection reason in every locale', () => {
    for (const locale of ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl']) {
      const media = JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${locale}/media.json`, import.meta.url), 'utf8'));
      for (const reason of UPLOAD_REJECTION_REASONS) {
        assert.ok(media.upload.rejection[reason], `${locale} ${reason}`);
      }
    }
  });
});
