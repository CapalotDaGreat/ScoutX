import { readFile, writeFile } from 'node:fs/promises';
const source = new URL('../src/features/scout-discovery/services/discoverySearchIndex.ts', import.meta.url);
const target = new URL('../functions/src/discoverySearchIndex.ts', import.meta.url);
const canonical = await readFile(source, 'utf8');
if (process.argv.includes('--write')) await writeFile(target, canonical);
else {
  const server = await readFile(target, 'utf8').catch(() => '');
  if (server !== canonical) throw new Error('Server search policy is stale. Run node scripts/sync-discovery-search.mjs --write');
}
