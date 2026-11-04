import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as Record<string, unknown>;
}

describe('welcome and scout honesty copy', () => {
  it('keeps English welcome promises grounded in confirmation and opt-in sharing', () => {
    const auth = loadJson('src/i18n/locales/en/auth.json') as {
      welcome: Record<string, string>;
      roleSelection: Record<string, string>;
    };
    assert.match(auth.welcome.heroDescription, /confirm|footage|Passport/i);
    assert.doesNotMatch(auth.welcome.heroDescription, /guaranteed|perfect tracking|AI will always/i);
    assert.match(auth.welcome.trustFootage, /confirm/i);
    assert.match(auth.roleSelection.scoutDescription, /not a rating of potential/i);
  });

  it('exposes coaching insufficient reasons for every readiness gate', () => {
    const analysis = loadJson('src/i18n/locales/en/matchAnalysis.json') as {
      coaching: { insufficient: Record<string, { title: string; body: string } | string> };
    };
    for (const reason of ['identity_unconfirmed', 'no_moments', 'coverage_insufficient', 'no_accepted_events'] as const) {
      const block = analysis.coaching.insufficient[reason] as { title: string; body: string };
      assert.ok(block.title.length > 0);
      assert.ok(block.body.length > 0);
    }
  });

  it('states scout discovery evidence limits in English and German', () => {
    const en = loadJson('src/i18n/locales/en/scout.json') as { discover: Record<string, string> };
    const de = loadJson('src/i18n/locales/de/scout.json') as { discover: Record<string, string> };
    assert.match(en.discover.evidenceNote, /Sparse film|not a full scouting/i);
    assert.match(de.discover.evidenceNote, /Scouting/i);
    assert.doesNotMatch(en.discover.subtitle, /instant results|global talent pool/i);
  });
});
