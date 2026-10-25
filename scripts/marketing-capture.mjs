import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(command, ['run', 'test:e2e:emulators', '--', 'marketingCapture.spec.ts'], {
  stdio: 'inherit', shell: process.platform === 'win32',
  env: { ...process.env, MARKETING_CAPTURE: '1', EXPO_PUBLIC_CAPTURE_MODE: '1' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
