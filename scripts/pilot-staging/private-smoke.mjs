import assert from 'node:assert/strict';
import { operatorIdentityToken } from './lib.mjs';

const worker = 'https://stg-fake-worker-315202089837.europe-west6.run.app';
const endpoint = worker + '/_ctl/log';
const anonymous = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(15000) });
assert.ok([401, 403].includes(anonymous.status), 'Anonymous invocation was not denied');
await anonymous.body?.cancel();

const token = await operatorIdentityToken(worker);
assert.ok(token, 'No operator identity token returned');
const authenticated = await fetch(endpoint, {
  headers: { Authorization: 'Bearer ' + token },
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
});
assert.equal(authenticated.status, 200, 'Authorized invocation failed');
assert.ok(Array.isArray(await authenticated.json()), 'Unexpected worker control response');
console.log('Private worker smoke test passed. Anonymous request denied; operator request accepted.');
