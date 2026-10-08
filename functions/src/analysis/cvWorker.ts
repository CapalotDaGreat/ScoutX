import { unavailableCvOutputs, type CvWorkerInput, type CvWorkerOutput } from './workerContract';
import { cvWorkerStatus, cvWorkerUrl, isApprovedWorkerOutput } from './cvConfig';
import { parseCvSegmentResult, type CvSegmentRequest, type CvSegmentResult } from './cvContract';

/**
 * Seam for a GPU computer-vision worker (tracking, events, pitch mapping). The only
 * implementation today reports every stage as NOT_AVAILABLE; swapping in a real worker must
 * not change the pipeline or report shape.
 */
export interface CvWorker {
  readonly id: string;
  readonly available: boolean;
  run(input: CvWorkerInput): Promise<CvWorkerOutput[]>;
}

export const notAvailableCvWorker: CvWorker = {
  id: 'not_available',
  available: false,
  run: async () => unavailableCvOutputs(),
};

let activeWorker: CvWorker = notAvailableCvWorker;

export function getCvWorker(): CvWorker {
  return activeWorker;
}

export function setCvWorker(worker: CvWorker): void {
  activeWorker = worker;
}

/** Contract v2: one segment per call. `null` means "no usable result", never a guess. */
export interface CvSegmentClient {
  analyzeSegment(request: CvSegmentRequest): Promise<CvSegmentResult | null>;
}

const CV_TIMEOUT_MS = 10 * 60 * 1000;
const METADATA_IDENTITY_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

/** Google-signed ID token for the worker's Cloud Run audience (private service, IAM invoker). */
async function identityToken(audience: string): Promise<string | null> {
  try {
    const response = await fetch(`${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? (await response.text()).trim() : null;
  } catch {
    return null;
  }
}

export function createHttpCvClient(baseUrl: string, env: NodeJS.ProcessEnv = process.env): CvSegmentClient {
  return {
    async analyzeSegment(request) {
      const emulated = env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
      const token = emulated ? null : await identityToken(baseUrl);
      if (!emulated && !token) return null;
      try {
        const response = await fetch(`${baseUrl}/v2/segments:analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(CV_TIMEOUT_MS),
        });
        if (!response.ok) return null;
        return parseCvSegmentResult(await response.json(), {
          segmentIndex: request.segmentIndex,
          startSec: request.startSec,
          endSec: request.endSec,
        });
      } catch {
        return null;
      }
    },
  };
}

let segmentClientOverride: CvSegmentClient | null = null;

export function setCvSegmentClient(client: CvSegmentClient | null): void {
  segmentClientOverride = client;
}

/**
 * The configured worker, or null until CV_WORKER_URL / CV_WORKER_APPROVED are set and a
 * verified evaluation approval is compiled in. Output from any other build is discarded.
 */
export function getCvSegmentClient(env: NodeJS.ProcessEnv = process.env): CvSegmentClient | null {
  if (cvWorkerStatus(env) !== 'available') return null;
  const url = cvWorkerUrl(env);
  const client = segmentClientOverride ?? (url ? createHttpCvClient(url, env) : null);
  if (!client) return null;
  return {
    async analyzeSegment(request) {
      const result = await client.analyzeSegment(request);
      return result && isApprovedWorkerOutput(result, env) ? result : null;
    },
  };
}
