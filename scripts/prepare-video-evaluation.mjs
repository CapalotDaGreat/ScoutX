import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const exec = promisify(execFile);
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const input = resolve(option('--input', ''));
if (!args.includes('--input')) throw new Error('Provide --input with an authorized local video. Nothing is uploaded.');
const localRoot = resolve('.local');
const out = resolve(option('--out', '.local/video-evaluation'));
const localRelative = relative(localRoot, out);
if (!localRelative || localRelative.startsWith('..') || isAbsolute(localRelative)) throw new Error('Output must be inside .local.');
// Refuse existing symlinks/junctions before creating private evaluation artifacts.
for (let directory = out; directory !== dirname(directory); directory = dirname(directory)) {
  try {
    if ((await realpath(directory)).toLowerCase() !== directory.toLowerCase()) throw new Error('Symlink/junction output refused.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await mkdir(out, { recursive: true });
const before = await stat(input);
if (!before.isFile()) throw new Error('Input is not a file.');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;
const { stdout } = await exec(ffprobe, [
  '-v', 'error', '-show_entries',
  'format=duration,size,bit_rate,format_name:stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,duration,pix_fmt,color_transfer,color_primaries,color_space',
  '-of', 'json', input,
], { maxBuffer: 1024 * 1024, timeout: 60_000, windowsHide: true });
const probe = JSON.parse(stdout);
const duration = Number(probe.format?.duration);
if (!Number.isFinite(duration) || duration <= 0 || duration > 9000) throw new Error('Invalid or out-of-scope video duration.');
const hash = createHash('sha256');
for await (const chunk of createReadStream(input)) hash.update(chunk);
const frames = [];
for (let index = 0; index < 12; index++) {
  const timestampSec = Math.round((duration * (index + 0.5)) / 12);
  const name = `sample-${String(index + 1).padStart(2, '0')}-${timestampSec}s.png`;
  const started = performance.now();
  await exec(ffmpeg, ['-y', '-v', 'error', '-ss', String(timestampSec), '-i', input, '-map', '0:v:0', '-an', '-sn', '-frames:v', '1', '-vf', 'scale=1280:-2', join(out, name)], { timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true });
  frames.push({ file: name, timestampSec, sha256: createHash('sha256').update(await readFile(join(out, name))).digest('hex'), extractionMs: Math.round(performance.now() - started) });
}
const after = await stat(input);
if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Source changed during preparation; discard these samples.');
await writeFile(join(out, 'evaluation-input.json'), JSON.stringify({
  schemaVersion: 1, preparedAt: new Date().toISOString(), sourceSha256: hash.digest('hex'), sourceBytes: before.size,
  localOnly: true, cloudUpload: false, privacy: 'No geographic/container tags extracted; frames remain private under ignored .local.',
  probe, frames, status: 'sampled_for_manual_anchor_review_not_annotated_or_model_validated',
}, null, 2) + '\n');
process.stdout.write(`Prepared ${frames.length} local frames and sanitized metadata in ${relative(process.cwd(), out)}. No model inference or upload performed.\n`);
