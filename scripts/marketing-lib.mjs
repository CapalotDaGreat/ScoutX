import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdir, realpath, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export function checkedPath(relative, prefix = 'marketing/') {
  if (typeof relative !== 'string' || !relative.startsWith(prefix) || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(p => !p || p === '..' || p === '.')) throw new Error(`Unsafe marketing path: ${relative}`);
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root, prefix) + path.sep)) throw new Error('Path escapes owned tree');
  return target;
}
export async function safePath(relative) {
  const target = checkedPath(relative);
  let current = path.dirname(target);
  while (current !== root) {
    try {
      const actual = await realpath(current);
      if (path.resolve(actual).toLowerCase() !== path.resolve(current).toLowerCase()) throw new Error(`Symlink/junction refused: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    current = path.dirname(current);
  }
  try {
    if ((await realpath(target)).toLowerCase() !== target.toLowerCase()) throw new Error('Symlink target refused');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path.dirname(target), { recursive: true });
  return target;
}
export function loadSharp() {
  const require = createRequire(import.meta.url);
  try { return require('sharp'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  const modules = process.env.MARKETING_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
  try { return createRequire(path.join(path.resolve(modules), 'package.json'))('sharp'); }
  catch { throw new Error('Sharp missing. Set MARKETING_NODE_MODULES to an existing node_modules containing sharp. No installation is performed.'); }
}
export const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');
export const specs = [
  ['app-store/headers/pitchproof-header.png',3840,1646,'header','YOUR FOOTBALL.','BACKED BY EVIDENCE.','Build your Football Passport. Record your progress.'],
  ['app-store/search-results/pitchproof-search.png',3840,2560,'search','YOUR FOOTBALL','PASSPORT.','Every journey. Backed by evidence.'],
  ['website/passport.webp',1920,1080,'feature','YOUR FOOTBALL','PASSPORT.','Identity, match logs and evidence in one place.'],
  ['website/development.webp',1920,1080,'feature','RECORD. REFLECT.','KEEP DEVELOPING.','Document your matches, goals and progress.'],
  ['website/media-analysis.webp',1920,1080,'feature','YOUR MEDIA.','YOUR EVIDENCE.','Keep the evidence behind your game together.'],
  ['website/scout-discovery.webp',1920,1080,'feature','DISCOVER.','REVIEW THE EVIDENCE.','Explore opted-in player profiles.'],
  ['website/players-scouts.webp',1920,1080,'split','PLAYERS BUILD.','SCOUTS EXPLORE.','Football identity. Evidence-led discovery.'],
  ['website/campaign-cta.webp',1920,1080,'feature','EVERY JOURNEY.','BACKED BY EVIDENCE.','PitchProof. Your football story, documented.'],
  ['social/open-graph.png',1200,630,'social','YOUR FOOTBALL','PASSPORT.','Every journey. Backed by evidence.'],
  ['social/campaign-square.png',1080,1080,'search','YOUR FOOTBALL','PASSPORT.','Every journey. Backed by evidence.'],
];
export async function manifest() { return JSON.parse(await readFile(checkedPath('marketing/app-store/manifests/assets.json'), 'utf8')); }
