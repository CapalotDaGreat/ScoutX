import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildE2eRunCommand, buildE2eRunCommands } from '../../scripts/lib/e2eRunPlan.mjs';

const seed = 'node scripts/seed-emulators.mjs';

describe('local emulator E2E run plan', () => {
  test('returns independent commands for separate emulator lifecycles', () => {
    assert.deepEqual(buildE2eRunCommands({ project: 'web-desktop,web-mobile' }), [
      `${seed} && npx playwright test e2e/flows --project=web-desktop`,
      `${seed} && npx playwright test e2e/flows --project=web-mobile`,
    ]);
  });
  test('keeps desktop, all flows and configured retries as defaults', () => {
    assert.equal(buildE2eRunCommand(), `${seed} && npx playwright test e2e/flows --project=web-desktop`);
    assert.equal(buildE2eRunCommand({}), buildE2eRunCommand());
  });

  test('resets before each isolated project in requested order', () => {
    for (const projects of [['web-desktop', 'web-mobile'], ['web-mobile', 'web-desktop']]) {
      assert.deepEqual(buildE2eRunCommand({ project: projects.join(','), noRetries: '1' }).split(' && '), [
        seed, `npx playwright test e2e/flows --project=${projects[0]} --retries=0`,
        seed, `npx playwright test e2e/flows --project=${projects[1]} --retries=0`,
      ]);
    }
  });

  test('accepts either browser alone and preserves filters for both projects', () => {
    for (const project of ['web-desktop', 'web-mobile', 'web-desktop,web-mobile']) {
      const commands = buildE2eRunCommand({ project, filters: ['guest', 'player.spec', 'marketingCapture.spec.ts'] }).split(' && ');
      assert.equal(commands.length, project.split(',').length * 2);
      for (const [index, name] of project.split(',').entries()) {
        assert.equal(commands[index * 2], seed);
        assert.equal(commands[index * 2 + 1], `npx playwright test e2e/flows/guest e2e/flows/player.spec e2e/flows/marketingCapture.spec.ts --project=${name}`);
      }
    }
  });

  test('only exact opt-in flags disable retries for every project', () => {
    for (const flags of [{ noRetries: '1' }, { marketingCapture: '1' }, { noRetries: '1', marketingCapture: '1' }]) {
      assert.equal((buildE2eRunCommand({ project: 'web-desktop,web-mobile', ...flags }).match(/--retries=0/g) ?? []).length, 2);
    }
    assert.equal(buildE2eRunCommand({ noRetries: 'true', marketingCapture: '0' }), buildE2eRunCommand());
  });

  test('rejects unsupported, empty, duplicate and injected projects', () => {
    for (const project of ['', 'chromium', 'web-desktop,', ' web-mobile', 'web-desktop,web-desktop', 'web-mobile,web-mobile', 'web-desktop,web-mobile,web-desktop', 'web-mobile && echo injected']) {
      assert.throws(() => buildE2eRunCommand({ project }), /Unsupported local browser project/);
    }
  });

  test('rejects shell injection, options, traversal and regex syntax in filters', () => {
    for (const filter of ['', '../player', 'guest/../../player', '--project=production', 'guest && echo injected', 'guest;echo', 'guest|player', 'guest$(echo)', 'guest`echo`', 'guest%PATH%', 'guest\nplayer', 'guest"', "guest'", 'guest.*', '(guest|player)', 'guest\\player']) {
      assert.throws(() => buildE2eRunCommand({ filters: ['player', filter] }), /Unsupported local flow filter/);
    }
  });
});
