import { unavailableCvOutputs, type CvWorkerInput, type CvWorkerOutput } from './workerContract';

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
