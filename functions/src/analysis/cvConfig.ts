/**
 * Operator switches for the GPU computer-vision worker. Nothing here has a default value:
 * until an operator deploys a worker and sets these, every CV stage stays `unavailable`.
 *
 * CV_WORKER_URL         HTTPS base URL of the deployed worker (CONFIG_REQUIRED).
 * CV_WORKER_APPROVED    'true' once the privacy/security review of the worker is done.
 * CV_EVENTS_VALIDATED   'true' only after the real-footage evaluation met the documented
 *                       thresholds; until then worker events stay `possible`, never counted.
 */
export type CvWorkerStatus = 'not_configured' | 'not_approved' | 'available';

function isEmulated(env: NodeJS.ProcessEnv): boolean {
  return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
}

export function cvWorkerUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.CV_WORKER_URL?.trim();
  if (!raw) return null;
  if (raw.startsWith('https://')) return raw.replace(/\/+$/, '');
  return isEmulated(env) && raw.startsWith('http://') ? raw.replace(/\/+$/, '') : null;
}

export function cvWorkerStatus(env: NodeJS.ProcessEnv = process.env): CvWorkerStatus {
  if (!cvWorkerUrl(env)) return 'not_configured';
  return env.CV_WORKER_APPROVED?.trim() === 'true' ? 'available' : 'not_approved';
}

export function cvEventsValidated(env: NodeJS.ProcessEnv = process.env): boolean {
  return cvWorkerStatus(env) === 'available' && env.CV_EVENTS_VALIDATED?.trim() === 'true';
}
