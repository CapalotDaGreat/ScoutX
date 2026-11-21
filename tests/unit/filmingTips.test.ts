import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FILMING_TIP_KEYS } from '../../src/features/match-analysis/filmingTips.ts';

const en = JSON.parse(readFileSync(new URL('../../src/i18n/locales/en/matchAnalysis.json', import.meta.url), 'utf8')) as {
  filmingTips: { items: Record<string, string> } & Record<string, unknown>;
};

test('every filming tip has English copy and the shirt number comes first', () => {
  assert.equal(FILMING_TIP_KEYS[0], 'number');
  for (const key of FILMING_TIP_KEYS) assert.equal(typeof en.filmingTips.items[key], 'string', key);
  assert.deepEqual(Object.keys(en.filmingTips.items).sort(), [...FILMING_TIP_KEYS].sort());
});

test('filming tips never mention faces as a way of recognising the player', () => {
  // Identity uses shirt number, kit and owner confirmation only (no facial recognition).
  const text = JSON.stringify(en.filmingTips).toLowerCase();
  assert.ok(text.includes('never by your face'));
  assert.ok(!/face (id|recognition|scan)/.test(text));
});
