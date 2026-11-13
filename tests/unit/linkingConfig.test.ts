import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { resolveDeepLinkPath, resolutionToPath } from '../../src/navigation/deepLinkResolver.ts';

const source = readFileSync(new URL('../../src/navigation/linking.ts', import.meta.url), 'utf8');
const configured = [...source.matchAll(/(?:path:\s*|:\s*)'([a-z][a-z0-9/:_-]*)'/gi)].map((match) => match[1]);

function isConfigured(path: string): boolean {
  const bare = path.split('?')[0];
  return configured.some((pattern) => {
    const expression = new RegExp(`^${pattern.replace(/:[A-Za-z]+/g, '[^/]+')}$`);
    return expression.test(bare);
  });
}

describe('navigation link configuration', () => {
  it('gives Privacy Center and Plan and usage their own addresses', () => {
    for (const path of ['player/privacy', 'player/plan', 'scout/privacy']) {
      assert.ok(isConfigured(path), `${path} has no screen`);
    }
  });

  it('puts the home screen underneath every directly linked screen so Back has a target', () => {
    for (const [app, home] of [['PlayerApp', 'PlayerTabs'], ['ScoutApp', 'ScoutTabs'], ['GuestApp', 'GuestMain']]) {
      assert.match(source, new RegExp(`${app}: \\{[^}]*?initialRouteName: '${home}'`, 's'));
    }
  });

  it('has a screen for every path the link gate can produce', () => {
    const signedIn = (role: 'player' | 'scout' | 'guest') => ({ authenticated: true, role });
    const cases: Array<[string, ReturnType<typeof signedIn> | { authenticated: false; role: null }]> = [
      ['trial/abc123', signedIn('player')], ['trial/abc123', signedIn('scout')], ['trial/abc123', signedIn('guest')],
      ['request/abc123', signedIn('player')], ['request/abc123', signedIn('scout')],
      ['reel/abc123', signedIn('player')],
      ['evidence/p1/e1', signedIn('player')], ['evidence/p1/e1', signedIn('scout')], ['evidence/p1/e1', signedIn('guest')],
      ['match/job1', signedIn('player')], ['match/job1/review', signedIn('player')], ['match/job1', signedIn('scout')],
      ['match/bad.id', signedIn('player')], ['match/a/b/c', signedIn('player')],
      ['report/owner1/media1', signedIn('scout')],
      ['match/job1', { authenticated: false, role: null }],
    ];
    for (const [link, session] of cases) {
      const path = resolutionToPath(resolveDeepLinkPath(link, session));
      assert.ok(isConfigured(path), `${link} for ${session.role ?? 'signed-out'} resolves to ${path}, which has no screen`);
    }
  });

  it('never routes a scout or a guest into a match report', () => {
    for (const role of ['scout', 'guest'] as const) {
      const resolution = resolveDeepLinkPath('match/job1', { authenticated: true, role });
      assert.equal(resolution.kind, 'unavailable');
    }
  });
});
