// Generates tiny-resolution video fixtures with ffmpeg-static so validation runs against real
// containers. Long fixtures use 1 fps at 160x90, which keeps 120 minutes to a few hundred KB.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../../../functions/package.json', import.meta.url));
const ffmpeg = require('ffmpeg-static');
const DIR = join(tmpdir(), 'scoutx-media-fixtures-v1');

function render(name, args) {
  const out = join(DIR, name);
  if (!existsSync(out)) execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args, out]);
  return out;
}

const color = (size, fps, seconds) => ['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=${fps}`, '-t', String(seconds)];
const h264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];

export function mediaFixtures() {
  mkdirSync(DIR, { recursive: true });
  const valid10 = render('valid_10min.mp4', [
    ...color('160x90', 2, 600),
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest',
    ...h264, '-c:a', 'aac', '-b:a', '16k',
  ]);
  const fixtures = {
    valid10,
    valid45: render('valid_45min.mp4', [...color('160x90', 1, 45 * 60), ...h264]),
    valid90: render('valid_90min.mp4', [...color('160x90', 1, 90 * 60), ...h264]),
    valid120: render('valid_120min.mp4', [...color('160x90', 1, 120 * 60), ...h264]),
    tooLong: render('too_long_151min.mp4', [...color('160x90', 1, 151 * 60), ...h264]),
    mov: render('valid_30s.mov', [...color('160x90', 5, 30), ...h264, '-f', 'mov']),
    unsupportedCodec: render('mpeg4_30s.mp4', [...color('160x90', 5, 30), '-c:v', 'mpeg4']),
    tinyResolution: render('tiny_64px.mp4', [...color('64x64', 5, 30), ...h264]),
  };
  const corrupted = join(DIR, 'corrupted.mp4');
  if (!existsSync(corrupted)) {
    const head = readFileSync(fixtures.mov).subarray(0, 32);
    const noise = Buffer.alloc(64 * 1024);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 7919) % 251;
    writeFileSync(corrupted, Buffer.concat([head, noise]));
  }
  const notVideo = join(DIR, 'not_video.mp4');
  if (!existsSync(notVideo)) {
    writeFileSync(notVideo, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(4096, 3)]));
  }
  return { ...fixtures, corrupted, notVideo };
}
