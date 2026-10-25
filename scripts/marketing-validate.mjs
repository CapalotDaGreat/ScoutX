import assert from 'node:assert/strict';
import { loadSharp, manifest, specs, safePath, sha256 } from './marketing-lib.mjs';
if (process.argv.length !== 2) throw new Error('Usage: node scripts/marketing-validate.mjs');
const sharp = loadSharp();
const data = await manifest();
assert.equal(data.assets.length,specs.length);
assert.equal(await sha256(await safePath(data.source.path)),data.source.sha256,'Source changed; recompose');
for (const [name,w,h] of specs) {
  const record = data.assets.find(a => a.exportPath === `marketing/${name}`);
  assert.ok(record,`Missing record: ${name}`);
  const file = await safePath(record.exportPath);
  const m = await sharp(file).metadata();
  assert.equal(m.width,w,name); assert.equal(m.height,h,name);
  assert.equal(m.hasAlpha,false,`${name}: alpha channel prohibited`);
  assert.equal(m.format,name.endsWith('.webp') ? 'webp' : 'png');
  assert.equal(await sha256(file),record.sha256,`${name}: stale hash`);
  assert.equal(record.nativeScreenshot,false);
  const stats = await sharp(file).stats();
  assert.ok(stats.channels.some(c => c.stdev > 10),`${name}: blank export`);
}
console.log(`PASS: ${specs.length} exports; dimensions, format, opacity, nonblank pixels and provenance hashes. Store acceptance/native capture NOT verified.`);
