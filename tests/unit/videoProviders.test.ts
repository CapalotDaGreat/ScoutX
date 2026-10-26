import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkFetchable,
  inspectSource,
  isPublicAddress,
  recognise,
  veoMetadata,
  type HeadResult,
} from '../../functions/src/analysis/videoProviders.ts';

const VEO =
  'https://app.veo.co/matches/20260823-fc-pfaffikon-fc-dubendorf-1-mannschaft-vs-fc-dubendorf-v13121b4/?highlight=36f9ac91-6398-437b-9b88-c4a07e91dab0&scroll=MT';
const publicDns = async () => ['34.120.10.10'];

test('recognises Veo match links and extracts only permitted metadata', () => {
  assert.equal(recognise(VEO), 'veo');
  const meta = veoMetadata(new URL(VEO));
  assert.equal(meta.recordedOn, '2026-08-23');
  assert.match(String(meta.title), /dubendorf/);
  assert.equal(recognise('ftp://example.com/a.mp4'), 'unsupported');
  assert.equal(recognise('not a url'), 'unsupported');
});

test('Veo links never resolve to media without a partner integration: actionable export steps instead', async () => {
  const result = await inspectSource(VEO, { maxBytes: 4 * 1024 ** 3, env: {} });
  assert.equal(result.status, 'requires_export');
  assert.equal(result.mediaUrl, undefined);
  assert.ok(result.steps && result.steps.length >= 3);
  const partner = await inspectSource(VEO, { maxBytes: 1, env: { VEO_PARTNER_API_BASE: 'https://partner.example' } });
  assert.equal(partner.status, 'partner_access_required');
  const notMatch = await inspectSource('https://app.veo.co/clubs/x/', { maxBytes: 1, env: {} });
  assert.equal(notMatch.status, 'invalid');
});

test('private, loopback, link-local and metadata addresses are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.1.1', '0.0.0.0',
    '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '34.120.10.10', '2a00:1450:4001::1']) assert.equal(isPublicAddress(ip), true, ip);
});

test('fetchability rules: https on 443, no credentials, no internal hosts, all DNS answers public', async () => {
  assert.equal(await checkFetchable(new URL('http://cdn.example.com/a.mp4'), publicDns), 'https_required');
  assert.equal(await checkFetchable(new URL('https://u:p@cdn.example.com/a.mp4'), publicDns), 'credentials_in_url');
  assert.equal(await checkFetchable(new URL('https://cdn.example.com:8443/a.mp4'), publicDns), 'port_not_allowed');
  assert.equal(await checkFetchable(new URL('https://metadata.google.internal/x'), publicDns), 'host_not_allowed');
  assert.equal(await checkFetchable(new URL('https://169.254.169.254/x'), publicDns), 'private_address');
  assert.equal(await checkFetchable(new URL('https://rebind.example.com/a.mp4'), async () => ['34.1.1.1', '10.0.0.5']),
    'private_address');
  assert.equal(await checkFetchable(new URL('https://cdn.example.com/a.mp4'), publicDns), null);
});

test('every redirect hop is re-validated and bounded', async () => {
  const hops: Record<string, HeadResult> = {
    'https://share.example.com/v': { status: 302, headers: { location: 'https://127.0.0.1/secret.mp4' } },
  };
  const head = async (url: string) => hops[url] ?? { status: 404, headers: {} };
  const blocked = await inspectSource('https://share.example.com/v', { maxBytes: 10, resolve: publicDns, head });
  assert.equal(blocked.status, 'invalid');
  assert.equal(blocked.reason, 'private_address');

  const loop = async (url: string) => ({ status: 302, headers: { location: `${url}x` } });
  const tooMany = await inspectSource('https://share.example.com/v', { maxBytes: 10, resolve: publicDns, head: loop });
  assert.equal(tooMany.reason, 'too_many_redirects');
});

test('direct media links must be video, of known size and within the plan limit', async () => {
  const head = (type: string, bytes?: number) => async () => ({
    status: 200,
    headers: { 'content-type': type, ...(bytes === undefined ? {} : { 'content-length': String(bytes) }) },
  });
  const opts = { maxBytes: 1000, resolve: publicDns };
  assert.equal((await inspectSource('https://cdn.example.com/a.mp4', { ...opts, head: head('text/html', 10) })).status, 'not_video');
  assert.equal((await inspectSource('https://cdn.example.com/a.mp4', { ...opts, head: head('video/mp4') })).reason, 'size_unknown');
  assert.equal((await inspectSource('https://cdn.example.com/a.mp4', { ...opts, head: head('video/mp4', 5000) })).status, 'too_large');
  const ok = await inspectSource('https://cdn.example.com/a.mp4', { ...opts, head: head('video/mp4', 500) });
  assert.equal(ok.status, 'ready');
  assert.equal(ok.mediaUrl, 'https://cdn.example.com/a.mp4');
});
