import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

type Profile = { extends?: string; environment?: string; env?: Record<string, string>; ios?: { simulator?: boolean }; autoSubmit?: boolean };
const eas = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8')) as { build: Record<string, Profile>; cli: { appVersionSource?: string } };
const appConfig = readFileSync(new URL('../../app.config.ts', import.meta.url), 'utf8');

describe('EAS profiles select their environment explicitly', () => {
  test('every release-configuration profile names the production environment itself', () => {
    for (const name of ['simulator', 'preview', 'production']) {
      assert.equal(eas.build[name].environment, 'production', name);
    }
  });

  test('no profile submits automatically; build numbers stay remote', () => {
    for (const [name, profile] of Object.entries(eas.build)) assert.notEqual(profile.autoSubmit, true, name);
    assert.equal(eas.cli.appVersionSource, 'remote');
  });

  test('preview (Ad Hoc against production) passes the same build gate as production', () => {
    assert.match(appConfig, /EAS_BUILD_PROFILE === 'production' \|\| process\.env\.EAS_BUILD_PROFILE === 'preview'\) \{\s*\n\s*const problems = productionBuildProblems\(/);
  });

  test('a preflight exists that evaluates the real Expo config before a billed build', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts['preflight:eas'], 'node scripts/eas-preflight.mjs');
    const script = readFileSync(new URL('../../scripts/eas-preflight.mjs', import.meta.url), 'utf8');
    assert.match(script, /'expo', 'config', '--json', '--type', 'public'/);
    assert.doesNotMatch(script, /console\.log\([^)]*\benv\[/, 'values are never printed');
  });
});
