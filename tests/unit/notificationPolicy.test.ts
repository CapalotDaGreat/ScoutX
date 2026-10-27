import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PUSHES_PER_HOUR,
  decidePush,
  defaultStoredPreferences,
  parseStoredPreferences,
} from '../../functions/src/notificationPolicy.ts';
import { parseNotificationPreferences } from '../../src/features/notifications/services/notificationPreferencesParser.ts';

const NOW = 1_800_000_000_000;

describe('Server-side notification policy', () => {
  test('missing preferences allow known activity types', () => {
    assert.deepEqual(decidePush('trial_invitation', parseStoredPreferences(undefined), [], NOW), {
      send: true,
      category: 'trial',
    });
  });

  test('unknown activity types never push', () => {
    const decision = decidePush('profile_updated', defaultStoredPreferences(), [], NOW);
    assert.deepEqual(decision, { send: false, reason: 'unknown_type' });
  });

  test('a global opt-out suppresses everything', () => {
    const prefs = parseStoredPreferences({ pushEnabled: false });
    assert.deepEqual(decidePush('trial_invitation', prefs, [], NOW), {
      send: false,
      reason: 'push_disabled',
    });
  });

  test('a disabled category is enforced', () => {
    const prefs = parseStoredPreferences({ pushEnabled: true, categories: { passport: false } });
    assert.deepEqual(decidePush('portfolio_viewed', prefs, [], NOW), {
      send: false,
      reason: 'category_disabled',
    });
    assert.equal(decidePush('trial_invitation', prefs, [], NOW).send, true);
  });

  test('legacy category keys still opt the user out', () => {
    const prefs = parseStoredPreferences({ categories: { trials: false, recommendations: false } });
    assert.equal(prefs.categories.trial, false);
    assert.equal(prefs.categories.passport, false);
    assert.equal(prefs.categories.analysis, true);
  });

  test('the hourly cap applies across categories', () => {
    const recent = Array.from({ length: MAX_PUSHES_PER_HOUR }, (_, index) => NOW - index * 60_000);
    assert.deepEqual(decidePush('trial_invitation', defaultStoredPreferences(), recent, NOW), {
      send: false,
      reason: 'hourly_cap',
    });
    const old = recent.map((time) => time - 2 * 60 * 60 * 1000);
    assert.equal(decidePush('trial_invitation', defaultStoredPreferences(), old, NOW).send, true);
  });

  test('client and server parse preferences identically', () => {
    const stored = { pushEnabled: true, categories: { watchlist: false, analysis: false } };
    const client = parseNotificationPreferences(stored);
    const server = parseStoredPreferences(stored);
    assert.deepEqual(client, server);
  });
});

test('quiet hours suppress the push (not the activity), wrap past midnight and validate input', async () => {
  const { decidePush, defaultStoredPreferences, inQuietHours, parseStoredPreferences } = await import('../../functions/src/notificationPolicy.ts');
  const quiet = { enabled: true, startMinute: 22 * 60, endMinute: 7 * 60, utcOffsetMinutes: 60 };
  const at = (utcHour: number, utcMin = 0) => Date.UTC(2026, 9, 27, utcHour, utcMin);
  assert.equal(inQuietHours(quiet, at(21, 30)), true, '22:30 local (UTC+1)');
  assert.equal(inQuietHours(quiet, at(5, 59)), true, '06:59 local');
  assert.equal(inQuietHours(quiet, at(6, 0)), false, '07:00 local');
  assert.equal(inQuietHours(quiet, at(12)), false);
  assert.equal(inQuietHours({ ...quiet, enabled: false }, at(23)), false);
  const prefs = { ...defaultStoredPreferences(), quietHours: quiet };
  assert.deepEqual(decidePush('analysis_completed', prefs, [], at(23)), { send: false, reason: 'quiet_hours' });
  assert.equal(decidePush('analysis_completed', prefs, [], at(12)).send, true);
  assert.equal(parseStoredPreferences({ quietHours: { enabled: true, startMinute: 2000, endMinute: 1, utcOffsetMinutes: 0 } }).quietHours, null);
  assert.equal(parseStoredPreferences({}).quietHours, null);
});
