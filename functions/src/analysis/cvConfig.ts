import { APPROVED_CV_WORKER, type CvApproval } from './cvApproval.generated';

/**
 * Operator switches for the GPU computer-vision worker. Nothing here has a default value:
 * until an operator deploys a worker and sets these, every CV stage stays `unavailable`.
 *
 * CV_WORKER_URL         HTTPS base URL of the deployed worker (CONFIG_REQUIRED).
 * CV_WORKER_APPROVED    'true' once the privacy/security review of the worker is done.
 * CV_EVENTS_VALIDATED   'true' only after the real-footage evaluation met the documented
 *                       thresholds; until then worker events stay `possible`, never counted.
 *
 * The switches alone are not enough: the worker also needs an approval record that passed
 * scripts/cv-approval.mjs (compiled into APPROVED_CV_WORKER), and every response must come
 * from exactly the approved worker version and model set.
 */
export type CvWorkerStatus = 'not_configured' | 'not_approved' | 'not_evaluated' | 'available';

function isEmulated(env: NodeJS.ProcessEnv): boolean {
  return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
}

let emulatorApproval: CvApproval | null = null;

/** Test seam: honoured only under the emulators, never in a deployed function. */
export function setEmulatorCvApproval(approval: CvApproval | null): void {
  emulatorApproval = approval;
}

export function cvApproval(env: NodeJS.ProcessEnv = process.env): CvApproval | null {
  if (APPROVED_CV_WORKER) return APPROVED_CV_WORKER;
  return isEmulated(env) ? emulatorApproval : null;
}

export function cvWorkerUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.CV_WORKER_URL?.trim();
  if (!raw) return null;
  if (raw.startsWith('https://')) return raw.replace(/\/+$/, '');
  return isEmulated(env) && raw.startsWith('http://') ? raw.replace(/\/+$/, '') : null;
}

export function cvWorkerStatus(env: NodeJS.ProcessEnv = process.env): CvWorkerStatus {
  if (!cvWorkerUrl(env)) return 'not_configured';
  if (env.CV_WORKER_APPROVED?.trim() !== 'true') return 'not_approved';
  return cvApproval(env) ? 'available' : 'not_evaluated';
}

export function cvEventsValidated(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    cvWorkerStatus(env) === 'available' &&
    env.CV_EVENTS_VALIDATED?.trim() === 'true' &&
    cvApproval(env)?.eventsApproved === true
  );
}

/** A response from any other worker build or model set than the evaluated one is discarded. */
export function isApprovedWorkerOutput(
  output: { workerVersion: string; models: Readonly<Record<string, string>> },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const approval = cvApproval(env);
  if (!approval || output.workerVersion !== approval.workerVersion) return false;
  const expected = Object.entries(approval.models);
  return (
    expected.length > 0 &&
    expected.length === Object.keys(output.models).length &&
    expected.every(([key, value]) => output.models[key] === value)
  );
}
