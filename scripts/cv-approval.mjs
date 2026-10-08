#!/usr/bin/env node
// Checks docs/video/evaluation/approval.json against the evidence it cites.
//   node scripts/cv-approval.mjs           report only
//   node scripts/cv-approval.mjs --write   also regenerate functions/src/analysis/cvApproval.generated.ts
// An absent or invalid record always generates `null`, which keeps the worker off at runtime.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_PATH, generatedModule, verifyCvApproval } from './lib/cvApproval.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = verifyCvApproval(root);
console.log(`CV worker approval: ${result.state}`);
for (const problem of result.problems) console.log(`  - ${problem}`);

const expected = generatedModule(result.runtime);
const target = join(root, GENERATED_PATH);
if (process.argv.includes('--write')) {
  writeFileSync(target, expected);
  console.log(`wrote ${GENERATED_PATH}`);
} else if (readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== expected) {
  console.log(`${GENERATED_PATH} is out of date; run with --write`);
  process.exitCode = 1;
}
if (result.state === 'invalid') process.exitCode = 1;
