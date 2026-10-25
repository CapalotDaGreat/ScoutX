import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
export function parseStagingArgs(args) {
  const values = {};
  const flags = new Set(['commit', 'authorize-metadata-staging']);
  const names = new Set(['run-dir', 'owner-id', 'job-id', 'generation', 'anchor-revision', 'project', 'bucket']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || Object.hasOwn(values, key) || (!flags.has(key) && !names.has(key))) throw new Error('Invalid or duplicate option');
    values[key] = flags.has(key) ? true : args[++i];
    if (typeof values[key] !== 'boolean' && (typeof values[key] !== 'string' || values[key].startsWith('--'))) throw new Error('Missing option value');
  }
  for (const key of ['run-dir', 'owner-id', 'job-id', 'generation', 'anchor-revision']) if (!Object.hasOwn(values, key)) throw new Error(`Required: --${key}`);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(values['owner-id']) || !/^[A-Za-z0-9_-]{6,80}$/.test(values['job-id'])
    || !/^(0|[1-9][0-9]{0,5})$/.test(values.generation) || !/^[1-9][0-9]{0,5}$/.test(values['anchor-revision'])) throw new Error('Invalid target scope');
  if (/^(https?:|\\\\|\/\/)/i.test(values['run-dir'])) throw new Error('A local run directory is required');
  if (values.commit && (!values['authorize-metadata-staging'] || !/^[a-z][a-z0-9-]{4,60}$/.test(values.project ?? '')
    || ![`${values.project}.appspot.com`, `${values.project}.firebasestorage.app`].includes(values.bucket))) throw new Error('Commit requires explicit authorization, project and matching bucket');
  return values;
}

export async function loadEvidenceRun(directory) {
  const root = await realpath(path.resolve(directory));
  let total = 0;
  const read = async (name) => {
    const file = await realpath(path.join(root, name));
    if (path.dirname(file) !== root) throw new Error('Run file escapes directory');
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(16 * 1024 * 1024 + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      total += length;
      if (length === buffer.length || total > 64 * 1024 * 1024) throw new Error('Run metadata exceeds limit');
      return JSON.parse(buffer.subarray(0, length).toString('utf8'));
    } finally { await handle.close(); }
  };
  const artifact = await read('artifact.json'), plan = await read('plan.json');
  if (!Array.isArray(plan.segments) || !plan.segments.length || plan.segments.length > 15) throw new Error('Invalid segment schedule');
  const segments = [];
  for (let i = 0; i < plan.segments.length; i++) segments.push(await read(`segment-${String(i).padStart(3, '0')}.json`));
  return { artifact, bundle: { plan, complete: await read('complete.json'), identity: await read('identity.json'), segments } };
}

export async function main(args) {
  const options = parseStagingArgs(args);
  const { artifact, bundle } = await loadEvidenceRun(options['run-dir']);
  const { validateEvidenceRunBundle } = require('./lib/analysis/identityEvidenceValidation.js');
  const run = validateEvidenceRunBundle(artifact, bundle);
  if (!run || artifact.sourcePath !== `profiles/${options['owner-id']}/matchFootage/${options['job-id']}/video.mp4`
    || artifact.generation !== Number(options.generation) || artifact.anchorRevision !== Number(options['anchor-revision'])) throw new Error('Run does not match the requested complete target scope');
  if (!options.commit) return { status: 'dry_run_only', segmentCount: run.segmentCount, sourceVerified: false, productionApproved: false };
  // Never obtain credentials or contact a project before the compiled release gate passes.
  const { cvWorkerStatus } = require('./lib/analysis/cvConfig.js');
  if (process.env.EXPERIMENTAL_TARGET_ANCHORS !== 'true' || cvWorkerStatus() !== 'available') throw new Error('Production approval gates are closed');
  const hosts = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'];
  if (hosts.some((key) => process.env[key]) && (!options.project.startsWith('demo-')
    || hosts.some((key) => !/^(localhost|127\.0\.0\.1):[0-9]+$/.test(process.env[key] ?? '')))) throw new Error('Mixed production/emulator configuration is forbidden');
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: options.project, storageBucket: options.bucket });
  const { stageTrustedIdentityEvidence } = require('./lib/analysis/identityEvidenceStaging.js');
  return stageTrustedIdentityEvidence(getFirestore(app), options['owner-id'], { jobId: options['job-id'],
    expectedGeneration: Number(options.generation), expectedAnchorRevision: Number(options['anchor-revision']) }, artifact, bundle);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Evidence staging failed. Check local metadata, scope, consent, source and approval gates. No gate was changed.'); process.exitCode = 1; });
}
