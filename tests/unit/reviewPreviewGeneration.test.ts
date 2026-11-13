import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const root = new URL('../../', import.meta.url);
const generated = new URL('scripts/review-preview/.generated/reports.json', root);
const generate = () => execFileSync(process.execPath, ['scripts/review-preview/generate.mjs'], { cwd: root, encoding: 'utf8' });
const digest = () => createHash('sha256').update(readFileSync(generated)).digest('hex');

describe('clean checkout: the review-preview data is generated, not hand-made', () => {
  test('typecheck generates it first, so a fresh checkout needs no manual step', () => {
    const scripts = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts as Record<string, string>;
    assert.equal(scripts['preview:prepare'], 'node scripts/review-preview/generate.mjs');
    assert.match(scripts.pretypecheck, /npm run --silent preview:prepare/);
  });

  test('generation is deterministic and idempotent', () => {
    generate();
    const first = digest();
    generate();
    assert.equal(digest(), first);
  });

  test('the output carries no machine paths', () => {
    generate();
    const text = readFileSync(generated, 'utf8');
    assert.doesNotMatch(text, /file:\/\/|\/home\/|\/Users\/|[A-Za-z]:\\\\/);
  });

  test('the app never imports the preview or its data, so production bundles cannot contain it', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|jsx)$/.test(name) && /review-preview|\.generated\/reports/.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    };
    walk(new URL('src', root).pathname);
    for (const entry of ['App.tsx', 'index.ts', 'app.config.ts']) {
      try {
        if (/review-preview/.test(readFileSync(new URL(entry, root), 'utf8'))) offenders.push(entry);
      } catch {
        // entry file not present in this project layout
      }
    }
    assert.deepEqual(offenders, []);
  });
});
