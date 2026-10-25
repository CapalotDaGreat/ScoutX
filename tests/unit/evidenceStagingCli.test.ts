import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStagingArgs } from '../../scripts/stage-identity-evidence.mjs';
const base = ['--run-dir', '.local/run', '--owner-id', 'owner', '--job-id', 'staging-job', '--generation', '0', '--anchor-revision', '1'];
test('staging CLI defaults to metadata-only dry run', () => { assert.equal(parseStagingArgs(base).commit, undefined); });
test('staging CLI rejects ambiguous scope and unsupported media/training inputs', () => {
  for (const extra of [['--train'], ['--video', 'movie.mp4'], ['--generation', '1'], ['--commit'],
    ['--commit', '--authorize-metadata-staging', '--project', 'actual-project', '--bucket', 'other.appspot.com']]) {
    assert.throws(() => parseStagingArgs([...base, ...extra]));
  }
});
test('staging CLI requires explicit metadata authorization and matching project bucket', () => {
  assert.equal(parseStagingArgs([...base, '--commit', '--authorize-metadata-staging', '--project', 'demo-scoutx', '--bucket', 'demo-scoutx.appspot.com']).commit, true);
});
