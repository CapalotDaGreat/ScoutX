import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const cliRoot = path.dirname(expo.resolve('@expo/cli/package.json'));
const cli = createRequire(path.join(cliRoot, 'package.json'));
test('patched Zod validates the real Expo dev-tools extension schema', () => {
  assert.equal(cli('zod/package.json').version, '4.6.7');
  const { createMCPDevToolsExtensionSchema } = cli('./build/src/start/server/createMCPDevToolsExtensionSchema.js');
  const schema = createMCPDevToolsExtensionSchema({ packageName: 'local-test', cliExtensions: { commands: [{ name: 'inspect', title: 'Inspect', parameters: [
    { name: 'count', type: 'number' }, { name: 'confirm', type: 'confirm' }, { name: 'text', type: 'text' },
  ] }] } });
  assert.equal(schema.safeParse({ command: 'inspect', count: 1, confirm: true, text: 'test' }).success, true);
  for (const input of [{ command: 'missing' }, { command: 'inspect', count: 'wrong' }, { command: 'inspect', unexpected: true }]) {
    assert.equal(schema.safeParse(input).success, false);
  }
});
test('patched gRPC and Functions UUID dependencies retain required runtime APIs without network calls', () => {
  const firestore = createRequire(require.resolve('@firebase/firestore/package.json'));
  const grpc = firestore('@grpc/grpc-js');
  const client = new grpc.Client('localhost:1', grpc.credentials.createInsecure());
  client.close();
  const functions = createRequire(new URL('../../functions/package.json', import.meta.url));
  for (const parent of ['gaxios', 'google-gax', 'teeny-request']) {
    const nested = createRequire(functions.resolve(`${parent}/package.json`));
    const uuid = nested('uuid');
    assert.equal(uuid.validate(uuid.v4()), true);
  }
  const tunnel = createRequire(require.resolve('@expo/ngrok/package.json'));
  const uuid = tunnel('uuid');
  assert.equal(uuid.validate(uuid.v4()), true);
  assert.equal(typeof require('body-parser').json(), 'function');
  assert.equal(require('fast-uri').parse('https://example.test/a').scheme, 'https');
  assert.equal(new (require('ip-address').Address6)('2001:db8::1').correctForm(), '2001:db8::1');
});
