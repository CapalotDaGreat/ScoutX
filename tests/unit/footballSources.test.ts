import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  FOOTBALL_SOURCE_PROVIDERS,
  footballSourceLogContext,
  hostMatches,
  parseFootballSourceUrl,
  providerForHost,
} from '../../src/features/football-sources/core.ts';

function accepted(input: string) {
  const result = parseFootballSourceUrl(input);
  assert.equal(result.ok, true, `${input} should be accepted`);
  if (!result.ok) throw new Error('unreachable');
  return result;
}

function rejected(input: string) {
  const result = parseFootballSourceUrl(input);
  assert.equal(result.ok, false, `${input} should be rejected`);
  if (result.ok) throw new Error('unreachable');
  return result.error;
}

describe('football source core', () => {
  it('client and server copies are identical', () => {
    const client = readFileSync(new URL('../../src/features/football-sources/core.ts', import.meta.url), 'utf8');
    const server = readFileSync(new URL('../../functions/src/footballSources/core.ts', import.meta.url), 'utf8');
    assert.equal(client.replace(/\r\n/g, '\n'), server.replace(/\r\n/g, '\n'));
  });

  it('accepts approved providers and resolves them', () => {
    assert.equal(accepted('https://www.fvrz.ch/de/spielbetrieb/resultate').provider.id, 'fvrz');
    assert.equal(accepted('https://matchcenter.fvrz.ch/team/123').provider.id, 'fvrz');
    assert.equal(accepted('https://www.football.ch/sfv/verein.aspx?v=1').provider.id, 'football_ch');
    assert.equal(accepted('https://www.fupa.net/player/max-muster').provider.id, 'fupa');
    assert.equal(accepted('https://www.fussball.de/spieltagsuebersicht/x').provider.id, 'fussball_de');
    assert.equal(accepted('https://fulltime.thefa.com/index.html').provider.id, 'the_fa');
    assert.equal(accepted('https://www.transfermarkt.co.uk/a/profil/spieler/1').provider.id, 'transfermarkt');
  });

  it('rejects anything that is not https', () => {
    for (const input of [
      'http://www.fvrz.ch/',
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'file:///etc/passwd',
      'ftp://fvrz.ch/',
      'blob:https://fvrz.ch/123',
      'intent://fvrz.ch#Intent;scheme=https;end',
      'pitchproof://fvrz.ch',
      'fvrz.ch/team/1',
      '//fvrz.ch/team/1',
    ]) {
      assert.equal(rejected(input), 'not_https', input);
    }
  });

  it('rejects lookalike, unsupported and malformed hosts', () => {
    assert.equal(rejected('https://fvrz.ch.attacker.com/team'), 'unsupported_provider');
    assert.equal(rejected('https://evilfvrz.ch/team'), 'unsupported_provider');
    assert.equal(rejected('https://fvrz.chx/team'), 'unsupported_provider');
    assert.equal(rejected('https://example.com/?u=https://fvrz.ch'), 'unsupported_provider');
    assert.equal(rejected('https://example.com/#https://fvrz.ch'), 'unsupported_provider');
    assert.equal(rejected('https://user:pass@fvrz.ch/'), 'credentials');
    assert.equal(rejected('https://fvrz.ch@evil.com/'), 'credentials');
    assert.equal(rejected('https://fvrz.ch:8443/'), 'port');
    assert.equal(rejected('https://127.0.0.1/'), 'ip_address');
    assert.equal(rejected('https://[::1]/'), 'port');
    assert.equal(rejected('https://evil.com\\@fvrz.ch/'), 'malformed');
    assert.equal(rejected('https://fvrz.ch/te am'), 'malformed');
    assert.equal(rejected('https://fvrž.ch/'), 'malformed');
    assert.equal(rejected('https://fvrz.ch./'), 'malformed');
    assert.equal(rejected('https:///fvrz.ch'), 'malformed');
    assert.equal(rejected('   '), 'empty');
    assert.equal(rejected(`https://fvrz.ch/${'a'.repeat(2100)}`), 'too_long');
  });

  it('agrees with the WHATWG URL parser on the host for accepted links', () => {
    for (const input of [
      'https://WWW.FVRZ.CH/De/Team?id=5#/tab',
      'https://matchcenter.fvrz.ch/a/b/',
      'https://www.fupa.net/club/fc-x?season=2026',
    ]) {
      const result = accepted(input);
      assert.equal(new URL(result.url).hostname, result.host);
      assert.equal(new URL(input).hostname, result.host);
    }
  });

  it('normalises host case, trailing slashes and plain fragments but keeps the query', () => {
    assert.equal(accepted('  https://WWW.FVRZ.CH/De/Team/  ').url, 'https://www.fvrz.ch/De/Team');
    assert.equal(accepted('https://www.fvrz.ch/').url, 'https://www.fvrz.ch');
    assert.equal(accepted('https://www.fvrz.ch/team?id=5&season=2026#top').url, 'https://www.fvrz.ch/team?id=5&season=2026');
    assert.equal(accepted('https://www.fvrz.ch/app#/team/5').url, 'https://www.fvrz.ch/app#/team/5');
    assert.equal(accepted('https://www.fvrz.ch/team?').url, 'https://www.fvrz.ch/team');
  });

  it('deduplicates equivalent links per provider', () => {
    const a = accepted('https://www.fvrz.ch/team/5/');
    const b = accepted('https://FVRZ.ch/team/5#section');
    assert.equal(a.dedupeKey, b.dedupeKey);
    assert.notEqual(a.dedupeKey, accepted('https://www.fvrz.ch/team/5?season=2025').dedupeKey);
  });

  it('registry: unique ids and hosts, link-only, no unsafe host entries', () => {
    const ids = FOOTBALL_SOURCE_PROVIDERS.map((provider) => provider.id);
    assert.equal(new Set(ids).size, ids.length);
    const hosts = FOOTBALL_SOURCE_PROVIDERS.flatMap((provider) => provider.allowedHosts);
    assert.equal(new Set(hosts).size, hosts.length);
    for (const provider of FOOTBALL_SOURCE_PROVIDERS) {
      assert.equal(provider.mode, 'link_only');
      assert.equal(provider.linkOnly, true);
      assert.notEqual(provider.legalReviewStatus, 'approved_for_import');
      assert.notEqual(provider.legalReviewStatus, 'approved_for_api');
      for (const host of provider.allowedHosts) {
        assert.match(host, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, `${provider.id} host ${host}`);
        assert.equal(providerForHost(host)?.id, provider.id);
      }
    }
  });

  it('host matching needs a label boundary', () => {
    assert.equal(hostMatches('a.fvrz.ch', 'fvrz.ch'), true);
    assert.equal(hostMatches('afvrz.ch', 'fvrz.ch'), false);
    assert.equal(hostMatches('fvrz.ch.evil.com', 'fvrz.ch'), false);
  });

  it('log context never contains the URL', () => {
    const source = { providerId: 'fvrz', sourceType: 'team', url: 'https://www.fvrz.ch/x?player=1' };
    const context = footballSourceLogContext(source);
    assert.deepEqual(Object.keys(context).sort(), ['providerId', 'sourceType']);
    assert.equal(JSON.stringify(context).includes('fvrz.ch'), false);
  });
});
